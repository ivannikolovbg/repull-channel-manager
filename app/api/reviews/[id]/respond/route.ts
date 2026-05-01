/**
 * POST /api/reviews/[id]/respond
 *   body: { body: string }
 *   - Submits a host response. Persists locally, then ships to Repull.
 *   - On channel failure, the row stays as a draft and the error is surfaced.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { respondToReview } from '@/core/services/reviews/reviews.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => ({}))) as { body?: string };
  const body = (json.body ?? '').trim();
  if (!body) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 });
  }

  try {
    const result = await respondToReview({
      workspaceId: session.workspace.id,
      reviewId: id,
      body,
      workspaceMemberId: session.userId,
    });
    return NextResponse.json({
      ok: true,
      submitted: result.submitted,
      channelError: result.channelError,
      response: result.response,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
