/**
 * POST /api/messages/sync
 *   body: { conversationId?: string }
 *
 * Triggers a fresh sync from Repull. With `conversationId`, refetches just
 * that thread's messages; otherwise re-pulls the whole inbox.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import {
  syncConversations,
  syncMessagesForConversation,
} from '@/core/services/messaging/messaging.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { conversationId?: string };

  try {
    if (body.conversationId) {
      const out = await syncMessagesForConversation(ctx.workspace.id, body.conversationId);
      return NextResponse.json({ ok: true, kind: 'thread', ...out });
    }
    const stats = await syncConversations(ctx.workspace.id);
    return NextResponse.json({ ok: true, kind: 'inbox', stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
