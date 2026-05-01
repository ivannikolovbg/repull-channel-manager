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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env.local and set it.');
}

declare global {
  // eslint-disable-next-line no-var
  var __repullCmPool: Pool | undefined;
}

const pool =
  globalThis.__repullCmPool ??
  new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__repullCmPool = pool;
}

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
