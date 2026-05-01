/**
 * GET /api/messages
 *   Query: status?=open|archived|spam|all  unreadOnly?=1  platform?  search?  limit?  offset?
 *   → { data: InboxRow[], counts: InboxCounts }
 *
 * Server component pages can read directly from the messaging service, but
 * the inbox client polls this route on a timer and on tab focus.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import {
  getInboxCounts,
  listConversations,
} from '@/core/services/messaging/messaging.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get('status') ?? 'open';
  const status: 'open' | 'archived' | 'spam' | 'all' =
    statusParam === 'archived' || statusParam === 'spam' || statusParam === 'all'
      ? statusParam
      : 'open';
  const filters = {
    status,
    unreadOnly: sp.get('unreadOnly') === '1',
    platform: sp.get('platform'),
    search: sp.get('search'),
    limit: Number(sp.get('limit') ?? 100),
    offset: Number(sp.get('offset') ?? 0),
  };

  const [data, counts] = await Promise.all([
    listConversations(ctx.workspace.id, filters),
    getInboxCounts(ctx.workspace.id),
  ]);
  return NextResponse.json({ data, counts });
}
