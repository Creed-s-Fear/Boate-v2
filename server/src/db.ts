import pg from 'pg';
import { config } from './config';

// BIGINT volta como string por padrão; saldos e lamports cabem em Number com folga,
// mas convertemos explicitamente onde importa.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});

const SCHEMA = `
create table if not exists users (
  id bigserial primary key,
  username text not null unique,
  pass_hash text not null,
  balance bigint not null default 0 check (balance >= 0),
  last_reward_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash bytea primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);

-- índice de derivação HD = users.id; só o endereço público fica no banco
create table if not exists deposit_addresses (
  user_id bigint primary key references users(id) on delete cascade,
  address text not null unique,
  last_signature text,
  watch_until timestamptz not null default now()
);
create index if not exists deposit_watch_idx on deposit_addresses(watch_until);

create table if not exists deposits (
  signature text primary key,
  user_id bigint not null references users(id),
  lamports bigint not null,
  fichas bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists deposits_user_idx on deposits(user_id, created_at desc);

create table if not exists ledger (
  id bigserial primary key,
  user_id bigint not null references users(id),
  delta bigint not null,
  kind text not null check (kind in ('deposit', 'spend', 'reward', 'bonus')),
  ref text,
  balance_after bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on ledger(user_id, id desc);

alter table users add column if not exists vip boolean not null default false;
create unique index if not exists ledger_spend_once on ledger(user_id, ref) where kind = 'spend';
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
