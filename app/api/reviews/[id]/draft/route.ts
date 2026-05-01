/**
 * PUT /api/reviews/[id]/draft
 *   body: { body: string, source?: 'human' | 'ai-suggested' }
 *   - Saves (or replaces) the per-review draft response. Used by autosave-on-blur
 *     in the response composer.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { saveDraftResponse } from '@/core/services/reviews/reviews.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const json = (await req.json().catch(() => ({}))) as {
    body?: string;
    source?: 'human' | 'ai-suggested';
  };
  const body = json.body ?? '';

  try {
    const draft = await saveDraftResponse({
      workspaceId: session.workspace.id,
      reviewId: id,
      body,
      workspaceMemberId: session.userId,
      source: json.source ?? 'human',
    });
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
