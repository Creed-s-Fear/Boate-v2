/** Devnet test: npm run airdrop -- <username> [sol]. Requests test SOL for the account's deposit address. */
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { config } from '../src/config';
import { pool } from '../src/db';
import { connection } from '../src/deposits';

if (config.cluster === 'mainnet-beta') throw new Error('Airdrop does not exist on mainnet.');
const [username, solArg = '1'] = process.argv.slice(2);
if (!username) throw new Error('Usage: npm run airdrop -- <username> [sol]');
const sol = Number(solArg);
if (!(sol > 0 && sol <= 2)) throw new Error('Between 0 and 2 SOL per request.');

const r = await pool.query('select a.address from deposit_addresses a join users u on u.id = a.user_id where u.username = $1', [username.toLowerCase()]);
if (!r.rowCount) throw new Error('Account not found.');
const address = r.rows[0].address as string;
try {
  const sig = await connection.requestAirdrop(new PublicKey(address), Math.round(sol * LAMPORTS_PER_SOL));
  console.log(`Airdrop requested for ${address}: ${sig}`);
  console.log('Credits after finalized (~15–30 s): open the wallet in the game and click "Check deposits".');
} catch (e) {
  console.log(`The ${config.cluster} faucet refused (${(e as Error).message}).`);
  console.log(`Use https://faucet.solana.com with the address: ${address}`);
}
await pool.end();
