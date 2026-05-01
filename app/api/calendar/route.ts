/**
 * GET /api/calendar?listingId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Returns calendar_days rows for the given listing in the workspace.
 *
 * POST /api/calendar
 *   body: { listingId, date, available?, blockedReason?, dailyPrice?, minNights?, push? }
 *   Saves a manual override (`source: 'manual'`). When the workspace's
 *   `auto_push_calendar` flag is on (default) — or when `push: true` is
 *   explicitly passed — also pushes the change back to Repull via
 *   PUT /v1/availability/{propertyId}.
 *
 *   Response shape:
 *     { ok: true, repullSynced: boolean, repullSyncedAt: ISO|null, error?: string }
 *   On Repull push failure the local override is still saved (so the host can
 *   keep working) but `repullSynced` is false and `error` is populated.
 */

import { and, between, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { calendarDays, listings, workspaces } from '@/core/db/schema';
import { getSessionWorkspace } from '@/core/lib/session';
import { getRepullForWorkspace } from '@/core/services/repull-client';
import { pushCalendarOverride } from '@/core/services/calendar-push';

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
    /** Force a Repull push regardless of the workspace `auto_push_calendar` setting. */
    push?: boolean;
  };

  if (!body.listingId || !body.date) {
    return NextResponse.json({ error: 'listingId and date required' }, { status: 400 });
  }

  const listingRows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.workspaceId, ctx.workspace.id), eq(listings.id, body.listingId)))
    .limit(1);
  const listing = listingRows[0];
  if (!listing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const wsRows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspace.id))
    .limit(1);
  const workspace = wsRows[0]!;
  const shouldPush = body.push ?? workspace.autoPushCalendar;

  // Try to push first so we know whether to mark the row as synced. If the
  // push fails we still save locally — the host can retry from the UI.
  let repullSynced = false;
  let pushError: string | null = null;
  let repullSyncedAt: Date | null = null;
  if (shouldPush) {
    try {
      const client = await getRepullForWorkspace(ctx.workspace.id);
      const result = await pushCalendarOverride({
        client,
        listing,
        payload: {
          date: body.date,
          available: body.available ?? true,
          dailyPrice: body.dailyPrice ?? null,
          minNights: body.minNights ?? null,
        },
      });
      if (result.ok) {
        repullSynced = true;
        repullSyncedAt = new Date();
      } else {
        pushError = result.error ?? 'unknown push error';
      }
    } catch (err) {
      pushError = (err as Error).message;
    }
  }

  const now = new Date();
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
      repullSyncedAt,
      repullSyncError: pushError,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [calendarDays.listingId, calendarDays.date],
      set: {
        available: body.available ?? true,
        blockedReason: body.blockedReason ?? null,
        dailyPrice: body.dailyPrice != null ? String(body.dailyPrice) : null,
        minNights: body.minNights ?? null,
        source: 'manual',
        repullSyncedAt,
        repullSyncError: pushError,
        updatedAt: now,
      },
    });

  return NextResponse.json({
    ok: true,
    repullSynced,
    repullSyncedAt: repullSyncedAt?.toISOString() ?? null,
    error: pushError,
    pushed: shouldPush,
  });
}
