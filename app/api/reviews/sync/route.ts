/**
 * POST /api/reviews/sync
 *   - Re-pulls reviews from every channel that exposes a reviews surface.
 *   - Workspace-scoped via session.
 */

import { NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { syncReviews } from '@/core/services/reviews/reviews.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const stats = await syncReviews(ctx.workspace.id);
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
