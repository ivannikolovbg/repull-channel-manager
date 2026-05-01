/**
 * One-click demo sign-in.
 *
 * Mints a NextAuth session row for the seeded `demo@repull.dev` user (created
 * by `scripts/seed-demo.ts`) and sets the session cookie on the response.
 * No magic-link round-trip — the demo button on `/sign-in` is the only entry.
 *
 * If `DEMO_REPULL_API_KEY` is set in env, we also (re-)apply it to the demo
 * workspace's `repull_api_key` field so "Connect a channel" works on the live
 * preview without a manual settings step. This makes the demo self-healing if
 * an old seeded value (e.g. `demo-stub-no-real-sync`) is still in the row.
 *
 * If the demo user has not been seeded (DB is fresh, seed-demo not run), the
 * route returns 503 with a clear hint instead of a confusing redirect loop.
 *
 * Production-safe:
 * - Hard-coded to the well-known demo email; cannot be used to impersonate
 *   an arbitrary user.
 * - 7-day session lifetime (vs. the default 30) so abandoned demo sessions
 *   roll off quickly.
 * - Disabled when DEMO_SIGNIN=off so a fork can opt out without code changes.
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { sessions, users, workspaces } from '@/core/db/schema';
import { encryptApiKey } from '@/core/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_EMAIL = 'demo@repull.dev';
const SESSION_TTL_DAYS = 7;

export async function POST(req: Request): Promise<Response> {
  if (process.env.DEMO_SIGNIN === 'off') {
    return new Response('Demo sign-in disabled.', { status: 404 });
  }

  const user = (await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1))[0];
  if (!user) {
    return new Response(
      'Demo user not seeded. Run `pnpm tsx scripts/seed-demo.ts` against this database.',
      { status: 503 },
    );
  }

  // Best-effort: refresh the demo workspace's API key from env on every signin so
  // a real key wired into Vercel env propagates without re-running the seed.
  const demoKey = process.env.DEMO_REPULL_API_KEY?.trim();
  if (demoKey) {
    const wsRow = (
      await db.select().from(workspaces).where(eq(workspaces.ownerUserId, user.id)).limit(1)
    )[0];
    if (wsRow) {
      const { value, encrypted } = encryptApiKey(demoKey);
      await db
        .update(workspaces)
        .set({ repullApiKey: value, repullApiKeyEncrypted: encrypted, updatedAt: new Date() })
        .where(eq(workspaces.id, wsRow.id));
    }
  }

  const sessionToken = randomUUID() + '.' + randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  // Match @auth/core's cookie naming and flags. We pick the prefix from the
  // request URL so this works on http://localhost AND https://*.vercel.app.
  const isSecure = new URL(req.url).protocol === 'https:';
  const cookieName = `${isSecure ? '__Secure-' : ''}authjs.session-token`;
  const cookieAttrs = [
    `${cookieName}=${sessionToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (isSecure) cookieAttrs.push('Secure');

  return new Response(null, {
    status: 303,
    headers: {
      'Set-Cookie': cookieAttrs.join('; '),
      Location: '/dashboard',
    },
  });
}

export async function GET(req: Request): Promise<Response> {
  // Allow GET as well so a plain `<a href="/api/auth/demo-signin">` link works
  // without JS — same handler.
  return POST(req);
}
