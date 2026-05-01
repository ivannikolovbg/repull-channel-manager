/**
 * POST /api/reviews/[id]/flag
 *   body: { reason: string }
 *   - Marks a review as `flagged` with a host-supplied reason. Used as a
 *     light triage queue for low ratings or mentions of safety / policy
 *     issues. Does not contact the channel.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { flagReview } from '@/core/services/reviews/reviews.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (json.reason ?? '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  try {
    const review = await flagReview({
      workspaceId: session.workspace.id,
      reviewId: id,
      reason,
    });
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
