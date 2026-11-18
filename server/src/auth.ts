import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config';
import { pool, tx } from './db';
import { depositKeypair } from './hd';

const COOKIE = 'sid';
const SESSION_DAYS = 30;
const USERNAME = /^[a-z0-9_]{3,20}$/;

export interface SessionUser {
  id: number;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

// Reference hash: login for nonexistent user takes the same time as a real one.
let dummyHash = '';

export async function sessionUser(req: FastifyRequest): Promise<SessionUser | null> {
  const token = req.cookies[COOKIE];
  if (!token || token.length > 100) return null;
  const r = await pool.query(
    'select u.id, u.username from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()',
    [sha256(token)],
  );
  return r.rowCount ? { id: Number(r.rows[0].id), username: r.rows[0].username } : null;
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  req.user = await sessionUser(req);
  if (!req.user) return reply.code(401).send({ error: 'Please log in.' });
}

async function startSession(reply: FastifyReply, userId: number): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [
    sha256(token),
    userId,
  ]);
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.production,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 20 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
  },
} as const;

type Credentials = { Body: { username: string; password: string } };

export async function authRoutes(app: FastifyInstance): Promise<void> {
  dummyHash = await hash(randomBytes(16).toString('hex'));

  app.post<Credentials>(
    '/api/auth/register',
    { schema: credentialsSchema, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const username = req.body.username.toLowerCase();
      if (!USERNAME.test(username)) return reply.code(400).send({ error: 'Username: 3 to 20 letters, numbers or _.' });
      const passHash = await hash(req.body.password);
      const userId = await tx(async (c) => {
        const r = await c.query(
          'insert into users (username, pass_hash, balance) values ($1, $2, $3) on conflict (username) do nothing returning id',
          [username, passHash, config.welcomeBonus],
        );
        if (!r.rowCount) return null;
        const id = Number(r.rows[0].id);
        const address = depositKeypair(config.masterSeed, id).publicKey.toBase58();
        await c.query('insert into deposit_addresses (user_id, address) values ($1, $2)', [id, address]);
        if (config.welcomeBonus > 0) {
          await c.query("insert into ledger (user_id, delta, kind, balance_after) values ($1, $2, 'bonus', $2)", [id, config.welcomeBonus]);
        }
        return id;
      });
      if (userId === null) return reply.code(409).send({ error: 'This username is already taken.' });
      await startSession(reply, userId);
      return { username };
    },
  );

  app.post<Credentials>(
    '/api/auth/login',
    { schema: credentialsSchema, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const username = req.body.username.toLowerCase();
      const r = await pool.query('select id, pass_hash from users where username = $1', [username]);
      const row = r.rows[0] as { id: string; pass_hash: string } | undefined;
      const ok = await verify(row?.pass_hash ?? dummyHash, req.body.password).catch(() => false);
      if (!row || !ok) return reply.code(401).send({ error: 'Incorrect username or password.' });
      await startSession(reply, Number(row.id));
      return { username };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await pool.query('delete from sessions where token_hash = $1', [sha256(token)]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireUser }, async (req) => {
    const r = await pool.query('select balance, vip from users where id = $1', [req.user!.id]);
    return { username: req.user!.username, balance: Number(r.rows[0].balance), vip: r.rows[0].vip as boolean };
  });
}
