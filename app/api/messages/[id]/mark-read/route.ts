/**
 * POST /api/messages/{id}/mark-read
 *   → { ok: true }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { markRead } from '@/core/services/messaging/messaging.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    await markRead(ctx.workspace.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
