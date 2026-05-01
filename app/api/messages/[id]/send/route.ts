/**
 * POST /api/messages/{id}/send
 *   body: { body: string, attachments?: Array<{ url, name?, mime?, sizeBytes? }> }
 *   → { ok: true, message }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { sendMessage } from '@/core/services/messaging/messaging.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    body?: string;
    attachments?: Array<{ url: string; name?: string; mime?: string; sizeBytes?: number }>;
  };
  if (!body.body || body.body.trim() === '') {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }
  try {
    const message = await sendMessage({
      workspaceId: ctx.workspace.id,
      conversationId: id,
      body: body.body,
      attachments: body.attachments,
      senderName: ctx.email,
    });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
