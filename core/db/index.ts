/**
 * Drizzle DB client.
 *
 * Uses node-postgres (`pg`) so it works against any Postgres — Vercel Postgres,
 * Neon (over their normal pooled URL), Supabase, or local docker-compose.
 *
 * Hot-reload safe: stashes the pool on `globalThis` in dev so HMR doesn't
 * exhaust the connection pool.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const rawConnectionString = process.env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env.local and set it.');
}

// Strip libpq-style `sslmode=...` from the URL. node-postgres/pg-connection-string
// translates `sslmode=require` into `verify-full` (per the pg v9 deprecation
// warning), which overrides the explicit `ssl: { rejectUnauthorized: false }`
// option below. Result: every Supabase / Neon / RDS connection rejects with
// "self-signed certificate in certificate chain". We hand pg the cleaned URL
// and let our `ssl` option below decide.
const connectionString = rawConnectionString.replace(/([?&])sslmode=[^&]*(&|$)/i, (_, p1, p2) =>
  p1 === '?' && p2 === '' ? '' : p1,
);

const isLocal =
  connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

declare global {
  // eslint-disable-next-line no-var
  var __repullCmPool: Pool | undefined;
}

const pool =
  globalThis.__repullCmPool ??
  new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__repullCmPool = pool;
}

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
