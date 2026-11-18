import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { priceOf } from '../../src/game/catalog';
import { requireUser } from './auth';
import { config } from './config';
import { pool, tx } from './db';
import { scanUser } from './deposits';

const WATCH_HOURS = 2;
const REWARD_COOLDOWN_MIN = 30;

async function balanceOf(userId: number): Promise<number> {
  const r = await pool.query('select balance from users where id = $1', [userId]);
  return Number(r.rows[0].balance);
}

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/wallet', { preHandler: requireUser }, async (req) => {
    const id = req.user!.id;
    const a = await pool.query(
      `update deposit_addresses set watch_until = now() + interval '${WATCH_HOURS} hours' where user_id = $1 returning address`,
      [id],
    );
    const d = await pool.query('select signature, lamports, fichas, created_at from deposits where user_id = $1 order by created_at desc limit 10', [id]);
    return {
      address: a.rows[0].address as string,
      cluster: config.cluster,
      fichasPerSol: Number(config.fichasPerSol),
      balance: await balanceOf(id),
      deposits: d.rows.map((r) => ({
        signature: r.signature as string,
        sol: Number(r.lamports) / 1e9,
        fichas: Number(r.fichas),
        at: (r.created_at as Date).toISOString(),
      })),
    };
  });

  app.post(
    '/api/wallet/refresh',
    { preHandler: requireUser, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const id = req.user!.id;
      await pool.query(`update deposit_addresses set watch_until = now() + interval '${WATCH_HOURS} hours' where user_id = $1`, [id]);
      try {
        const credited = await scanUser(id);
        return { credited, balance: await balanceOf(id) };
      } catch (e) {
        req.log.warn({ err: e }, 'refresh failed');
        return reply.code(503).send({ error: 'Solana network unavailable right now. Try again shortly.' });
      }
    },
  );

  app.post<{ Body: { item: string; requestId: string } }>(
    '/api/shop/spend',
    {
      preHandler: requireUser,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['item', 'requestId'],
          additionalProperties: false,
          properties: {
            item: { type: 'string', minLength: 1, maxLength: 48 },
            requestId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      const id = req.user!.id;
      const price = priceOf(req.body.item);
      if (price === null) return reply.code(400).send({ error: 'Unknown item.' });
      try {
        // the VIP pass is permanent: stored on the account and cannot be bought twice
        const isVip = req.body.item === 'vipPass';
        const balance = await tx(async (c) => {
          const u = await c.query(
            `update users set balance = balance - $2${isVip ? ', vip = true' : ''}
             where id = $1 and balance >= $2${isVip ? ' and not vip' : ''} returning balance`,
            [id, price],
          );
          if (!u.rowCount) return null;
          await c.query("insert into ledger (user_id, delta, kind, ref, balance_after) values ($1, $2, 'spend', $3, $4)", [
            id,
            -price,
            req.body.requestId,
            u.rows[0].balance,
          ]);
          return Number(u.rows[0].balance);
        });
        if (balance === null) {
          const v = await pool.query('select vip from users where id = $1', [id]);
          if (isVip && v.rows[0].vip) return reply.code(409).send({ error: 'You already have the VIP pass.', balance: await balanceOf(id) });
          return reply.code(402).send({ error: 'Insufficient balance.', balance: await balanceOf(id) });
        }
        return { balance };
      } catch (e) {
        // same requestId again (double click, network retry): already charged
        if ((e as { code?: string }).code === '23505') return { balance: await balanceOf(id), duplicate: true };
        throw e;
      }
    },
  );

  app.post('/api/reward/dance', { preHandler: requireUser }, async (req, reply) => {
    const id = req.user!.id;
    const prize = randomInt(40, 81);
    const r = await tx(async (c) => {
      const u = await c.query(
        `update users set balance = balance + $2, last_reward_at = now()
         where id = $1 and (last_reward_at is null or last_reward_at < now() - interval '${REWARD_COOLDOWN_MIN} minutes')
         returning balance`,
        [id, prize],
      );
      if (!u.rowCount) return null;
      await c.query("insert into ledger (user_id, delta, kind, balance_after) values ($1, $2, 'reward', $3)", [id, prize, u.rows[0].balance]);
      return Number(u.rows[0].balance);
    });
    if (r === null) return reply.code(429).send({ error: `Dance reward only every ${REWARD_COOLDOWN_MIN} minutes.` });
    return { prize, balance: r };
  });
}
