/**
 * GET /api/messages/{id}
 *   → { conversation, messages }
 *
 * Used by the thread pane on the client side after the user picks a
 * conversation from the list.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import {
  getConversation,
  listMessages,
} from '@/core/services/messaging/messaging.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await getConversation(ctx.workspace.id, id);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const msgs = await listMessages(ctx.workspace.id, id);
  return NextResponse.json({ conversation: detail, messages: msgs });
}
