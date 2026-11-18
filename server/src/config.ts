function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name} (run npm run env:init)`);
  return v;
}

function int(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  const v = raw === undefined ? def : Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${name} invalid`);
  return v;
}

const cluster = process.env.SOLANA_CLUSTER ?? 'devnet';
if (!['devnet', 'testnet', 'mainnet-beta'].includes(cluster)) throw new Error('SOLANA_CLUSTER invalid');
// Guard against accidentally running with real money.
if (cluster === 'mainnet-beta' && process.env.ALLOW_MAINNET !== '1') {
  throw new Error('mainnet-beta requires ALLOW_MAINNET=1');
}

const seedHex = req('DEPOSIT_MASTER_SEED');
if (!/^[0-9a-f]{64}$/i.test(seedHex)) throw new Error('DEPOSIT_MASTER_SEED must be 32 bytes in hex');

export const config = {
  port: int('PORT', 8787, 1, 65535),
  host: process.env.HOST ?? '127.0.0.1',
  production: process.env.NODE_ENV === 'production',
  databaseUrl: req('DATABASE_URL'),
  allowedOrigins: req('ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean),
  cluster: cluster as 'devnet' | 'testnet' | 'mainnet-beta',
  rpcUrl: process.env.SOLANA_RPC_URL ?? `https://api.${cluster}.solana.com`,
  masterSeed: Buffer.from(seedHex, 'hex'),
  fichasPerSol: BigInt(int('FICHAS_PER_SOL', 10_000, 1, 1_000_000_000)),
  welcomeBonus: int('WELCOME_BONUS', 0, 0, 1_000_000),
  scanIntervalMs: int('SCAN_INTERVAL_MS', 20_000, 2_000, 600_000),
  treasury: process.env.TREASURY_ADDRESS ?? '',
};
