/**
 * Moves SOL from deposit addresses to TREASURY_ADDRESS.
 * Without --yes it only lists what would be moved. The output is ignored by the deposit
 * scanner (negative delta), so it doesn't credit anything new.
 */
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { config } from '../src/config';
import { pool } from '../src/db';
import { connection } from '../src/deposits';
import { depositKeypair } from '../src/hd';

const send = process.argv.includes('--yes');
if (!config.treasury) throw new Error('Set TREASURY_ADDRESS in .env');
const treasury = new PublicKey(config.treasury);

const rows = (await pool.query('select user_id, address from deposit_addresses order by user_id')).rows as { user_id: string; address: string }[];
let total = 0;
for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100);
  const infos = await connection.getMultipleAccountsInfo(chunk.map((r) => new PublicKey(r.address)));
  for (let j = 0; j < chunk.length; j++) {
    const lamports = infos[j]?.lamports ?? 0;
    if (lamports === 0) continue;
    const kp = depositKeypair(config.masterSeed, Number(chunk[j].user_id));
    if (kp.publicKey.toBase58() !== chunk[j].address) throw new Error(`Address does not match the seed (account ${chunk[j].user_id})`);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const build = (amount: number) =>
      new Transaction({ feePayer: kp.publicKey, blockhash, lastValidBlockHeight }).add(
        SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: treasury, lamports: amount }),
      );
    const fee = (await connection.getFeeForMessage(build(lamports).compileMessage())).value ?? 5000;
    const amount = lamports - fee;
    if (amount <= 0) continue;
    total += amount;
    console.log(`account ${chunk[j].user_id}: ${amount / LAMPORTS_PER_SOL} SOL`);
    if (send) {
      const sig = await sendAndConfirmTransaction(connection, build(amount), [kp], { commitment: 'confirmed' });
      console.log(`  sent: ${sig}`);
    }
  }
}
console.log(`${send ? 'Moved' : 'Would move (use --yes)'}: ${total / LAMPORTS_PER_SOL} SOL to ${treasury.toBase58()}`);
await pool.end();
