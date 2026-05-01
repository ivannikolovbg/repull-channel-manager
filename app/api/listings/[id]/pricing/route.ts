/**
 * GET /api/listings/{id}/pricing?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Forwards to `GET /v1/listings/{repullPropertyId}/pricing` with the
 *   workspace's stored Repull API key. Returns the recommendation list
 *   verbatim from upstream so the calendar UI can overlay them on the
 *   synced base prices.
 *
 * POST /api/listings/{id}/pricing
 *   Body: { dates: ["YYYY-MM-DD", ...], action: "apply" | "decline" }
 *   Forwards to `POST /v1/listings/{repullPropertyId}/pricing`. On
 *   `apply` the upstream both writes the new price to the listing's
 *   calendar and fans out to the connected OTAs.
 *
 * Both routes are workspace-scoped via NextAuth + `requireSessionWorkspace`.
 * Both gate on `workspaces.atlas_recommendations_enabled` — when off, the
 * GET returns an empty list and POST returns 409 (so the UI can't push
 * stale changes when the toggle is off).
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { calendarDays, listings, workspaces } from '@/core/db/schema';
import { getSessionWorkspace } from '@/core/lib/session';
import { applyPricingAction, fetchListingPricing } from '@/core/services/atlas-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await props.params;
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 });
  }

  const workspaceRow = (
    await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspace.id)).limit(1)
  )[0];
  if (!workspaceRow) return NextResponse.json({ error: 'workspace not found' }, { status: 404 });

  // Per-workspace toggle.
  if (!workspaceRow.atlasRecommendationsEnabled) {
    return NextResponse.json({ data: [], disabled: true });
  }

  const listingRow = (
    await db
      .select()
      .from(listings)
      .where(and(eq(listings.workspaceId, ctx.workspace.id), eq(listings.id, id)))
      .limit(1)
  )[0];
  if (!listingRow) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Atlas recs are keyed off the Repull-side property id, not our local UUID.
  if (!listingRow.repullPropertyId) {
    return NextResponse.json({ data: [], reason: 'no_repull_property_id' });
  }

  try {
    const recs = await fetchListingPricing({
      workspaceId: ctx.workspace.id,
      repullPropertyId: listingRow.repullPropertyId,
      from,
      to,
    });
    return NextResponse.json({ data: recs });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch pricing' },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await props.params;
  const body = (await req.json().catch(() => ({}))) as {
    dates?: unknown;
    action?: unknown;
  };

  const action = body.action;
  if (action !== 'apply' && action !== 'decline') {
    return NextResponse.json(
      { error: 'action must be "apply" or "decline"' },
      { status: 400 },
    );
  }
  const dates = body.dates;
  if (!Array.isArray(dates) || dates.length === 0 || dates.some((d) => typeof d !== 'string')) {
    return NextResponse.json(
      { error: 'dates[] is required and must be an array of YYYY-MM-DD strings' },
      { status: 400 },
    );
  }

  const workspaceRow = (
    await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspace.id)).limit(1)
  )[0];
  if (!workspaceRow) return NextResponse.json({ error: 'workspace not found' }, { status: 404 });
  if (!workspaceRow.atlasRecommendationsEnabled) {
    return NextResponse.json(
      { error: 'Atlas recommendations are turned off for this workspace.' },
      { status: 409 },
    );
  }

  const listingRow = (
    await db
      .select()
      .from(listings)
      .where(and(eq(listings.workspaceId, ctx.workspace.id), eq(listings.id, id)))
      .limit(1)
  )[0];
  if (!listingRow) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!listingRow.repullPropertyId) {
    return NextResponse.json({ error: 'listing has no Repull property id' }, { status: 422 });
  }

  let upstream: unknown;
  try {
    upstream = await applyPricingAction({
      workspaceId: ctx.workspace.id,
      repullPropertyId: listingRow.repullPropertyId,
      dates: dates as string[],
      action,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to apply pricing action' },
      { status: 502 },
    );
  }

  // On `apply`, mirror the upstream result into our local calendar_days so
  // the UI doesn't have to wait for a webhook to refresh. We re-fetch the
  // affected dates from upstream so we get the canonical applied price.
  if (action === 'apply') {
    try {
      const refreshed = await fetchListingPricing({
        workspaceId: ctx.workspace.id,
        repullPropertyId: listingRow.repullPropertyId,
        from: (dates as string[])[0]!,
        to: (dates as string[])[(dates as string[]).length - 1]!,
      });
      const wantedDates = new Set(dates as string[]);
      const now = new Date();
      for (const r of refreshed) {
        if (!wantedDates.has(r.date)) continue;
        const newPrice = r.recommendedPrice;
        await db
          .insert(calendarDays)
          .values({
            workspaceId: ctx.workspace.id,
            listingId: id,
            date: r.date,
            available: true,
            dailyPrice: String(newPrice),
            source: 'sync',
            repullSyncedAt: now,
            repullSyncError: null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [calendarDays.listingId, calendarDays.date],
            set: {
              dailyPrice: String(newPrice),
              source: 'sync',
              repullSyncedAt: now,
              repullSyncError: null,
              updatedAt: now,
            },
          });
      }
    } catch {
      /* best-effort mirror — webhook will reconcile */
    }
  }

  return NextResponse.json({ ok: true, upstream });
}
