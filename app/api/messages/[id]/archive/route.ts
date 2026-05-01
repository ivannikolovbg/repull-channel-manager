/**
 * POST /api/messages/{id}/archive
 *   body: { action?: 'archive' | 'unarchive' | 'spam' }   default: 'archive'
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import {
  archiveConversation,
  markSpam,
  unarchiveConversation,
} from '@/core/services/messaging/messaging.service';

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
    action?: 'archive' | 'unarchive' | 'spam';
  };
  const action = body.action ?? 'archive';
  try {
    if (action === 'archive') await archiveConversation(ctx.workspace.id, id);
    else if (action === 'unarchive') await unarchiveConversation(ctx.workspace.id, id);
    else if (action === 'spam') await markSpam(ctx.workspace.id, id);
    else return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
