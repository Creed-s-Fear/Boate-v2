import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { authRoutes } from './auth';
import { config } from './config';
import { migrate, pool } from './db';
import { startScanner } from './deposits';
import { gameRoutes } from './routes';

const app = Fastify({
  logger: { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] },
  bodyLimit: 4 * 1024,
  trustProxy: process.env.TRUST_PROXY === '1',
});

app.decorateRequest('user', null);
await app.register(cookie);
await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

// CSRF: besides the SameSite=Strict cookie, every state-changing request must come from a known origin.
app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.origin;
  if (!origin || !config.allowedOrigins.includes(origin)) return reply.code(403).send({ error: 'Origin not allowed.' });
});

app.addHook('onSend', async (_req, reply) => {
  reply.header('Cache-Control', 'no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
});

app.setErrorHandler<Error & { statusCode?: number }>((err, req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) req.log.error({ err }, 'internal error');
  reply.code(status).send({ error: status >= 500 ? 'Internal error.' : err.message });
});

app.get('/api/health', async () => {
  await pool.query('select 1');
  return { ok: true, cluster: config.cluster };
});

await app.register(authRoutes);
await app.register(gameRoutes);

await migrate();
const stopScanner = startScanner((msg, err) => (err ? app.log.warn({ err }, msg) : app.log.info(msg)));
await app.listen({ port: config.port, host: config.host });
app.log.info(`Solana network: ${config.cluster}`);

const shutdown = async () => {
  stopScanner();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
