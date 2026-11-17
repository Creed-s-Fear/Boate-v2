/**
 * Cria server/.env com segredos novos (semente dos endereços de depósito e senha do banco).
 * Não imprime os segredos. Nunca sobrescreve um .env existente: a semente controla os
 * fundos de todos os endereços de depósito.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(file)) {
  console.log('server/.env já existe — nada foi alterado.');
  process.exit(0);
}

const dbPass = randomBytes(18).toString('base64url');
const env = `# Gerado por npm run env:init. NÃO versionar. Faça backup da semente fora do repositório.
NODE_ENV=development
PORT=8787
DATABASE_URL=postgres://boate:${dbPass}@127.0.0.1:5433/boate
POSTGRES_PASSWORD=${dbPass}
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174

SOLANA_CLUSTER=devnet
# SOLANA_RPC_URL=
DEPOSIT_MASTER_SEED=${randomBytes(32).toString('hex')}
FICHAS_PER_SOL=10000
WELCOME_BONUS=0
# carteira da casa que recebe a varredura (npm run sweep)
TREASURY_ADDRESS=
`;
writeFileSync(file, env, { mode: 0o600 });
console.log('server/.env criado (devnet).');
