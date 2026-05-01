/**
 * GET  /api/connections                — list this workspace's connections.
 * POST /api/connections                — body: { provider?: string }
 *                                        Mints a multi-channel Connect picker session via
 *                                        `POST /v1/connect` and returns `{ url, sessionId }`.
 *                                        The legacy single-provider Airbnb flow is still
 *                                        reachable by passing `{ provider: 'airbnb', mode: 'direct' }`.
 * DELETE /api/connections?id=...       — disconnect a connection (workspace-scoped).
 */

import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { connections } from '@/core/db/schema';
import { getRepullForWorkspace } from '@/core/services/repull-client';
import { getSessionWorkspace } from '@/core/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PickerSession {
  sessionId: string;
  url: string;
  expiresAt: string;
  state?: string | null;
}

export async function GET() {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.workspaceId, ctx.workspace.id));
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    provider?: string;
    mode?: 'picker' | 'direct';
    accessType?: 'full_access' | 'read_only';
    allowedProviders?: string[];
  };

  let client;
  try {
    client = await getRepullForWorkspace(ctx.workspace.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const redirectUrl = `${origin}/connections/return`;
  const directAirbnb = body.mode === 'direct' && body.provider === 'airbnb';

  try {
    if (directAirbnb) {
      const session = await client.connect.airbnb.create({
        redirectUrl,
        accessType: body.accessType ?? 'full_access',
      });
      return NextResponse.json({
        url: session.oauthUrl,
        sessionId: session.sessionId,
        provider: session.provider,
        expiresAt: session.expiresAt,
        mode: 'direct',
      });
    }

    // Default: multi-channel picker. Mint via raw POST /v1/connect (the SDK
    // doesn't yet wrap this surface — it shipped after the SDK 0.1.0-alpha cut).
    const picker = await (client as unknown as {
      request: <T>(method: string, path: string, init?: { body?: unknown }) => Promise<T>;
    }).request<PickerSession>('POST', '/v1/connect', {
      body: {
        redirectUrl,
        ...(body.allowedProviders?.length ? { allowed_providers: body.allowedProviders } : {}),
      },
    });
    return NextResponse.json({
      url: picker.url,
      sessionId: picker.sessionId,
      expiresAt: picker.expiresAt,
      mode: 'picker',
    });
  } catch (err) {
    const message = (err as Error).message ?? '';
    // Surface the demo-key footgun with a clearer hint instead of bare "Invalid API key.".
    if (/invalid api key/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'Repull rejected the workspace API key. Add a real key in /settings (or set DEMO_REPULL_API_KEY in your Vercel env if this is the demo workspace).',
        },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: message || 'connect failed' }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const existing = await db.select().from(connections).where(eq(connections.id, id)).limit(1);
  const conn = existing[0];
  if (!conn || conn.workspaceId !== ctx.workspace.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Best-effort upstream disconnect; always remove the local row.
  try {
    const client = await getRepullForWorkspace(ctx.workspace.id);
    if (conn.provider === 'airbnb') {
      await client.connect.airbnb.disconnect().catch(() => undefined);
    } else {
      await client.connect.disconnect(conn.provider).catch(() => undefined);
    }
  } catch {
    // ignore — we still want to remove the local row
  }

  await db.delete(connections).where(eq(connections.id, id));
  return NextResponse.json({ ok: true });
}
