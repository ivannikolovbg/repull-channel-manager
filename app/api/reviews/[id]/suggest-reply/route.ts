/**
 * POST /api/reviews/[id]/suggest-reply
 *   - Returns 2 suggested response variants (warm + concise) for the review.
 *   - Tagged "Powered by Vanio AI" in the UI.
 *   - Falls back to a deterministic local template if Repull's hosted AI
 *     surface is unavailable (so the demo always works).
 */

import { NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { suggestReplies } from '@/core/services/reviews/ai-reply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionWorkspace();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const suggestions = await suggestReplies(session.workspace.id, id);
    return NextResponse.json({ ok: true, suggestions, poweredBy: 'Vanio AI' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
