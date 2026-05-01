/**
 * GET  /api/messages/{id}/draft   → { body }
 * PUT  /api/messages/{id}/draft   body: { body: string }
 *
 * Per-(conversation, user) autosave that survives page reloads.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { getDraft, saveDraft } from '@/core/services/messaging/messaging.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await getDraft({
      workspaceId: ctx.workspace.id,
      conversationId: id,
      userId: ctx.userId,
    });
    return NextResponse.json({ body });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const payload = (await req.json().catch(() => ({}))) as { body?: string };
  try {
    await saveDraft({
      workspaceId: ctx.workspace.id,
      conversationId: id,
      userId: ctx.userId,
      body: payload.body ?? '',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
