/**
 * POST /api/sync
 *   body: { kind?: 'full' | 'incremental', listingId?: string }
 *   - listingId set → calendar-only sync for that listing
 *   - kind: 'full' (default) → full re-sync
 *   - kind: 'incremental' → listings + reservations only
 *
 * Workspace-scoped via session.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSessionWorkspace } from '@/core/lib/session';
import { runFullSync, runIncrementalSync, runListingCalendarSync } from '@/core/services/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    kind?: 'full' | 'incremental';
    listingId?: string;
  };

  try {
    if (body.listingId) {
      const days = await runListingCalendarSync(ctx.workspace.id, body.listingId);
      return NextResponse.json({ ok: true, calendarDays: days });
    }
    const stats =
      body.kind === 'incremental'
        ? await runIncrementalSync(ctx.workspace.id)
        : await runFullSync(ctx.workspace.id);
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
