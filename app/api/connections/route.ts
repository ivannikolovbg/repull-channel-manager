/**
 * GET  /api/connections           — list this workspace's connections
 * POST /api/connections           — body: { provider: 'airbnb', accessType?: 'full_access' | 'read_only' }
 *                                   mints a Connect session and returns { oauthUrl, sessionId }
 * DELETE /api/connections?id=...  — disconnect a connection (workspace-scoped)
 */

import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { connections } from '@/core/db/schema';
import { getRepullForWorkspace } from '@/core/services/repull-client';
import { getSessionWorkspace } from '@/core/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    accessType?: 'full_access' | 'read_only';
  };
  const provider = body.provider ?? 'airbnb';
  if (provider !== 'airbnb') {
    return NextResponse.json(
      { error: `Provider ${provider} not yet supported by this starter. Add it.` },
      { status: 400 },
    );
  }

  let client;
  try {
    client = await getRepullForWorkspace(ctx.workspace.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  try {
    const session = await client.connect.airbnb.create({
      redirectUrl: `${origin}/connections/return`,
      accessType: body.accessType ?? 'full_access',
    });
    return NextResponse.json({
      oauthUrl: session.oauthUrl,
      sessionId: session.sessionId,
      provider: session.provider,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
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
