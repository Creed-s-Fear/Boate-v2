/**
 * Detects deposits to account addresses and credits tokens once per
 * signature (primary key in `deposits`). Only reads `finalized` transactions: after that
 * there is no reorganization that would undo the deposit.
 */
import { Connection, PublicKey, type ConfirmedSignatureInfo } from '@solana/web3.js';
import { config } from './config';
import { pool, tx } from './db';

export const connection = new Connection(config.rpcUrl, { commitment: 'finalized', disableRetryOnRateLimit: true });

const LAMPORTS_PER_SOL = 1_000_000_000n;
const PAGE = 100;
const MAX_PAGES = 20;
const WATCH_BATCH = 100;

export function lamportsToFichas(lamports: bigint): bigint {
  return (lamports * config.fichasPerSol) / LAMPORTS_PER_SOL;
}

interface WatchedAddress {
  user_id: string;
  address: string;
  last_signature: string | null;
}

/** Credits the transaction if it increased the address balance. Returns credited tokens, or null if not yet readable. */
async function processSignature(userId: number, pub: PublicKey, signature: string): Promise<number | null> {
  const t = await connection.getParsedTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  if (!t) return null;
  if (!t.meta || t.meta.err) return 0;
  const idx = t.transaction.message.accountKeys.findIndex((k) => k.pubkey.equals(pub));
  if (idx < 0) return 0;
  const delta = BigInt(t.meta.postBalances[idx]) - BigInt(t.meta.preBalances[idx]);
  // outflows (sweep to treasury) and fees don't credit anything
  if (delta <= 0n) return 0;
  const fichas = lamportsToFichas(delta);

  return tx(async (c) => {
    const ins = await c.query(
      'insert into deposits (signature, user_id, lamports, fichas) values ($1, $2, $3, $4) on conflict do nothing',
      [signature, userId, delta.toString(), fichas.toString()],
    );
    if (!ins.rowCount || fichas === 0n) return 0;
    const u = await c.query('update users set balance = balance + $2 where id = $1 returning balance', [userId, fichas.toString()]);
    await c.query("insert into ledger (user_id, delta, kind, ref, balance_after) values ($1, $2, 'deposit', $3, $4)", [
      userId,
      fichas.toString(),
      signature,
      u.rows[0].balance,
    ]);
    return Number(fichas);
  });
}

/** Reads new transactions for the address (oldest to newest) and advances the cursor. */
export async function scanAddress(row: WatchedAddress): Promise<number> {
  const pub = new PublicKey(row.address);
  const userId = Number(row.user_id);
  const fresh: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await connection.getSignaturesForAddress(pub, { until: row.last_signature ?? undefined, before, limit: PAGE }, 'finalized');
    fresh.push(...batch);
    if (batch.length < PAGE) break;
    before = batch[batch.length - 1].signature;
  }
  let credited = 0;
  for (const s of fresh.reverse()) {
    if (!s.err) {
      const got = await processSignature(userId, pub, s.signature);
      // RPC doesn't have the transaction yet: stop here and retry next round
      if (got === null) break;
      credited += got;
    }
    await pool.query('update deposit_addresses set last_signature = $2 where user_id = $1', [userId, s.signature]);
  }
  return credited;
}

export async function scanUser(userId: number): Promise<number> {
  const r = await pool.query('select user_id, address, last_signature from deposit_addresses where user_id = $1', [userId]);
  return r.rowCount ? scanAddress(r.rows[0]) : 0;
}

/**
 * Only scans "watched" addresses (account opened the wallet in the last few hours): RPC cost
 * grows with who is depositing, not with the total number of accounts.
 */
export function startScanner(log: (msg: string, err?: unknown) => void): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const loop = async () => {
    try {
      const r = await pool.query(
        'select user_id, address, last_signature from deposit_addresses where watch_until > now() order by watch_until desc limit $1',
        [WATCH_BATCH],
      );
      for (const row of r.rows as WatchedAddress[]) {
        if (stopped) return;
        try {
          const n = await scanAddress(row);
          if (n > 0) log(`deposit credited: account ${row.user_id}, ${n} tokens`);
        } catch (e) {
          log(`failed to scan account ${row.user_id}`, e);
        }
      }
      await pool.query('delete from sessions where expires_at < now()');
    } catch (e) {
      log('deposit scan cycle failed', e);
    }
    if (!stopped) timer = setTimeout(loop, config.scanIntervalMs);
  };
  timer = setTimeout(loop, 1_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
