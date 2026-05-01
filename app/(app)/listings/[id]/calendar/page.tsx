import { notFound } from 'next/navigation';
import { and, between, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { calendarDays, listings, reservations } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';
import { CalendarGrid } from './calendar-grid';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireSessionWorkspace();
  const { id } = await params;
  const { month } = await searchParams;

  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.workspaceId, ctx.workspace.id), eq(listings.id, id)))
    .limit(1);
  const listing = rows[0];
  if (!listing) notFound();

  // Parse month YYYY-MM. Default = current month.
  const today = new Date();
  const m = month ?? `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const [yyyy, mm] = m.split('-').map(Number);
  const monthStart = new Date(Date.UTC(yyyy, mm - 1, 1));
  const monthEnd = new Date(Date.UTC(yyyy, mm, 0));
  const startStr = monthStart.toISOString().slice(0, 10);
  const endStr = monthEnd.toISOString().slice(0, 10);

  const days = await db
    .select()
    .from(calendarDays)
    .where(
      and(
        eq(calendarDays.workspaceId, ctx.workspace.id),
        eq(calendarDays.listingId, id),
        between(calendarDays.date, startStr, endStr),
      ),
    );

  const monthRes = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.workspaceId, ctx.workspace.id),
        eq(reservations.listingId, id),
        between(reservations.checkIn, startStr, endStr),
      ),
    );

  return (
    <CalendarGrid
      listingId={listing.id}
      listingName={listing.name ?? `Listing ${listing.externalListingId}`}
      currency={listing.currency}
      monthIso={m}
      monthStart={startStr}
      monthEnd={endStr}
      days={days.map((d) => ({
        date: d.date,
        available: d.available,
        dailyPrice: d.dailyPrice,
        minNights: d.minNights,
        source: d.source,
        blockedReason: d.blockedReason,
      }))}
      reservations={monthRes.map((r) => ({
        id: r.id,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        guestFirstName:
          (r.guestDetails as { firstName?: string } | null)?.firstName ?? null,
        confirmationCode: r.confirmationCode,
      }))}
    />
  );
}
