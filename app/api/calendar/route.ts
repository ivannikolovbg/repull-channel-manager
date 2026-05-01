/**
 * GET /api/calendar?listingId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Returns calendar_days rows for the given listing in the workspace.
 *
 * POST /api/calendar
 *   body: { listingId, date, available?, blockedReason?, dailyPrice?, minNights? }
 *   Manual override (source: 'manual'). Does NOT push back to Repull yet — a
 *   future enhancement is to also sync changes upstream.
 */

import { and, between, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { calendarDays, listings } from '@/core/db/schema';
import { getSessionWorkspace } from '@/core/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const listingId = sp.get('listingId');
  const from = sp.get('from');
  const to = sp.get('to');
  if (!listingId || !from || !to) {
    return NextResponse.json(
      { error: 'listingId, from, to are required (from/to are YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  // Verify listing belongs to workspace.
  const ownership = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.workspaceId, ctx.workspace.id), eq(listings.id, listingId)))
    .limit(1);
  if (!ownership[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const rows = await db
    .select()
    .from(calendarDays)
    .where(
      and(
        eq(calendarDays.workspaceId, ctx.workspace.id),
        eq(calendarDays.listingId, listingId),
        between(calendarDays.date, from, to),
      ),
    );
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    date?: string;
    available?: boolean;
    blockedReason?: string | null;
    dailyPrice?: number | null;
    minNights?: number | null;
  };

  if (!body.listingId || !body.date) {
    return NextResponse.json({ error: 'listingId and date required' }, { status: 400 });
  }

  const ownership = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.workspaceId, ctx.workspace.id), eq(listings.id, body.listingId)))
    .limit(1);
  if (!ownership[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await db
    .insert(calendarDays)
    .values({
      workspaceId: ctx.workspace.id,
      listingId: body.listingId,
      date: body.date,
      available: body.available ?? true,
      blockedReason: body.blockedReason ?? null,
      dailyPrice: body.dailyPrice != null ? String(body.dailyPrice) : null,
      minNights: body.minNights ?? null,
      source: 'manual',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [calendarDays.listingId, calendarDays.date],
      set: {
        available: body.available ?? true,
        blockedReason: body.blockedReason ?? null,
        dailyPrice: body.dailyPrice != null ? String(body.dailyPrice) : null,
        minNights: body.minNights ?? null,
        source: 'manual',
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
