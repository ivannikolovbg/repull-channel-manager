import type { Config } from 'drizzle-kit';

const url =
  process.env.DATABASE_URL ?? 'postgres://repull:repull@localhost:5432/repull_cm';

const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

export default {
  schema: './core/db/schema.ts',
  out: './core/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url,
    // Hosted Postgres (Supabase pooler, Neon, RDS) uses self-signed certs in
    // their chain. Match the runtime db client (`core/db/index.ts`) which sets
    // `rejectUnauthorized: false` for non-local URLs.
    ssl: isLocal ? false : { rejectUnauthorized: false },
  },
  strict: true,
  verbose: true,
} satisfies Config;
