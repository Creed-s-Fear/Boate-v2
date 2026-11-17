/** Teste na devnet: npm run airdrop -- <usuario> [sol]. Pede SOL de teste para o endereço de depósito da conta. */
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { config } from '../src/config';
import { pool } from '../src/db';
import { connection } from '../src/deposits';

if (config.cluster === 'mainnet-beta') throw new Error('Airdrop não existe na mainnet.');
const [username, solArg = '1'] = process.argv.slice(2);
if (!username) throw new Error('Uso: npm run airdrop -- <usuario> [sol]');
const sol = Number(solArg);
if (!(sol > 0 && sol <= 2)) throw new Error('Entre 0 e 2 SOL por pedido.');

const r = await pool.query('select a.address from deposit_addresses a join users u on u.id = a.user_id where u.username = $1', [username.toLowerCase()]);
if (!r.rowCount) throw new Error('Conta não encontrada.');
const address = r.rows[0].address as string;
try {
  const sig = await connection.requestAirdrop(new PublicKey(address), Math.round(sol * LAMPORTS_PER_SOL));
  console.log(`Airdrop pedido para ${address}: ${sig}`);
  console.log('Credita depois de finalizado (~15–30 s): abra a carteira no jogo e clique em "Verificar depósitos".');
} catch (e) {
  console.log(`A torneira da ${config.cluster} recusou (${(e as Error).message}).`);
  console.log(`Use https://faucet.solana.com com o endereço: ${address}`);
}
await pool.end();
