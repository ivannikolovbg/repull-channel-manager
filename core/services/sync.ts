/**
 * Sync service — pulls listings, reservations, and calendar days from Repull
 * into the local Postgres on a per-workspace basis.
 *
 * Three entry points:
 *   - runFullSync(workspaceId) — kicked off after a successful Connect
 *   - runIncrementalSync(workspaceId) — periodic catch-up (cron)
 *   - runListingCalendarSync(workspaceId, listingId) — single-listing refresh
 *
 * All writes are idempotent (`onConflictDoUpdate`).
 */

import { and, eq } from 'drizzle-orm';
import { Repull } from '@repull/sdk';
import { db } from '@/core/db';
import {
  calendarDays,
  connections,
  guests,
  listings,
  reservations,
  syncRuns,
  type Listing,
} from '@/core/db/schema';
import { getRepullForWorkspace } from './repull-client';

// ---------- Types ----------

interface AirbnbListingRow {
  listingId?: number | string;
  id?: number | string;
  name?: string;
  city?: string;
  country?: string;
  address?: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number | null;
  personCapacity?: number | null;
  thumbnailUrl?: string;
  photos?: string[];
  currency?: string;
  timezone?: string;
  connections?: Array<{ id?: string | number }>;
}

interface RepullPropertyRow {
  id?: number | string;
  externalId?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  thumbnail?: string;
  provider?: string;
}

interface RepullReservationRow {
  id?: number | string;
  confirmationCode?: string;
  propertyId?: number | string;
  externalListingId?: string;
  platform?: string;
  status?: string;
  checkIn?: string;
  checkOut?: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCount?: number;
  totalPrice?: number;
  currency?: string;
}

interface RepullCalendarDayRow {
  date: string;
  available?: boolean;
  price?: number;
  minNights?: number;
}

export interface SyncStats {
  listings: number;
  reservations: number;
  guests: number;
  calendarDays: number;
  errors: string[];
}

// ---------- Public API ----------

export async function runFullSync(workspaceId: string): Promise<SyncStats> {
  const runRow = await openRun(workspaceId, 'full');
  const stats: SyncStats = { listings: 0, reservations: 0, guests: 0, calendarDays: 0, errors: [] };
  try {
    const client = await getRepullForWorkspace(workspaceId);

    // 1) Listings — try Airbnb-channel listings first, fall back to /v1/properties.
    const syncedListings = await syncListings(client, workspaceId, stats);

    // 2) Reservations across the workspace (paginate to 200 max for the MVP).
    await syncReservations(client, workspaceId, syncedListings, stats);

    // 3) Calendars per listing (next 60 days).
    for (const l of syncedListings) {
      try {
        const days = await syncCalendarForListing(client, workspaceId, l, 60);
        stats.calendarDays += days;
      } catch (err) {
        stats.errors.push(`calendar for listing ${l.externalListingId}: ${(err as Error).message}`);
      }
    }

    await closeRun(runRow.id, 'success', stats);
    return stats;
  } catch (err) {
    stats.errors.push((err as Error).message);
    await closeRun(runRow.id, 'error', stats, (err as Error).message);
    throw err;
  }
}

export async function runIncrementalSync(workspaceId: string): Promise<SyncStats> {
  const runRow = await openRun(workspaceId, 'incremental');
  const stats: SyncStats = { listings: 0, reservations: 0, guests: 0, calendarDays: 0, errors: [] };
  try {
    const client = await getRepullForWorkspace(workspaceId);
    const syncedListings = await syncListings(client, workspaceId, stats);
    await syncReservations(client, workspaceId, syncedListings, stats);
    await closeRun(runRow.id, 'success', stats);
    return stats;
  } catch (err) {
    stats.errors.push((err as Error).message);
    await closeRun(runRow.id, 'error', stats, (err as Error).message);
    throw err;
  }
}

export async function runListingCalendarSync(workspaceId: string, listingId: string, days = 90) {
  const client = await getRepullForWorkspace(workspaceId);
  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.workspaceId, workspaceId), eq(listings.id, listingId)))
    .limit(1);
  const l = rows[0];
  if (!l) throw new Error(`listing ${listingId} not found`);
  return await syncCalendarForListing(client, workspaceId, l, days);
}

// ---------- Internals ----------

async function syncListings(
  client: Repull,
  workspaceId: string,
  stats: SyncStats,
): Promise<Listing[]> {
  const out: Listing[] = [];

  // Find or create the Airbnb connection row (we attach listings to it when we can).
  let airbnbConnectionId: string | null = null;
  try {
    const connectStatus = await client.connect.airbnb.status();
    if (connectStatus?.connected) {
      const upserted = await db
        .insert(connections)
        .values({
          workspaceId,
          provider: 'airbnb',
          repullConnectionId: connectStatus.id ? String(connectStatus.id) : null,
          externalAccountId: connectStatus.externalAccountId ?? null,
          status: 'active',
          hostMetadata: connectStatus.host as Record<string, unknown> | null,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [connections.workspaceId, connections.provider, connections.externalAccountId],
          set: {
            status: 'active',
            hostMetadata: connectStatus.host as Record<string, unknown> | null,
            lastSyncedAt: new Date(),
          },
        })
        .returning();
      airbnbConnectionId = upserted[0]?.id ?? null;
    }
  } catch (err) {
    // Not fatal — keep going with /v1/properties.
    stats.errors.push(`connect.airbnb.status: ${(err as Error).message}`);
  }

  // Try Airbnb-specific listing index first (richer data).
  let airbnbRows: AirbnbListingRow[] = [];
  try {
    const res = await client.channels.airbnb.listings.list({ limit: 100 });
    airbnbRows = Array.isArray(res)
      ? (res as AirbnbListingRow[])
      : ((res as { data?: AirbnbListingRow[] })?.data ?? []);
  } catch (err) {
    stats.errors.push(`channels.airbnb.listings.list: ${(err as Error).message}`);
  }

  for (const row of airbnbRows) {
    const externalListingId = String(row.listingId ?? row.id ?? '');
    if (!externalListingId) continue;
    const upserted = await db
      .insert(listings)
      .values({
        workspaceId,
        connectionId: airbnbConnectionId,
        externalListingId,
        name: row.name ?? null,
        address: row.address ?? null,
        city: row.city ?? null,
        country: row.country ?? null,
        photos: row.photos ?? (row.thumbnailUrl ? [row.thumbnailUrl] : []),
        maxGuests: row.maxGuests ?? row.personCapacity ?? null,
        bedrooms: row.bedrooms ?? null,
        bathrooms: row.bathrooms ? String(row.bathrooms) : null,
        currency: row.currency ?? null,
        timezone: row.timezone ?? null,
        raw: row as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [listings.workspaceId, listings.connectionId, listings.externalListingId],
        set: {
          name: row.name ?? null,
          address: row.address ?? null,
          city: row.city ?? null,
          country: row.country ?? null,
          photos: row.photos ?? (row.thumbnailUrl ? [row.thumbnailUrl] : []),
          maxGuests: row.maxGuests ?? row.personCapacity ?? null,
          bedrooms: row.bedrooms ?? null,
          bathrooms: row.bathrooms ? String(row.bathrooms) : null,
          currency: row.currency ?? null,
          timezone: row.timezone ?? null,
          raw: row as unknown as Record<string, unknown>,
          syncedAt: new Date(),
        },
      })
      .returning();
    if (upserted[0]) out.push(upserted[0]);
    stats.listings++;
  }

  // Also pull /v1/properties so we capture listings on PMS providers (Hostaway, Guesty, etc.)
  // AND back-fill the Repull-side property id on Airbnb listings we already created from the
  // channel index — that integer id is what /v1/availability/{propertyId} requires.
  try {
    const propRes = await client.properties.list({ limit: 200 });
    const propRows = (propRes?.data ?? []) as RepullPropertyRow[];
    for (const row of propRows) {
      const externalListingId = String(row.externalId ?? row.id ?? '');
      if (!externalListingId) continue;
      const repullPropertyId = row.id != null ? String(row.id) : null;

      // De-dupe: if we already inserted this listing via the Airbnb path,
      // back-fill `repullPropertyId` instead of creating a duplicate row.
      const existingIdx = out.findIndex((l) => l.externalListingId === externalListingId);
      if (existingIdx >= 0) {
        const existing = out[existingIdx]!;
        if (repullPropertyId && existing.repullPropertyId !== repullPropertyId) {
          const updated = await db
            .update(listings)
            .set({ repullPropertyId, syncedAt: new Date() })
            .where(eq(listings.id, existing.id))
            .returning();
          if (updated[0]) out[existingIdx] = updated[0];
        }
        continue;
      }

      const upserted = await db
        .insert(listings)
        .values({
          workspaceId,
          connectionId: null,
          externalListingId,
          repullPropertyId,
          name: row.name ?? null,
          address: row.address ?? null,
          city: row.city ?? null,
          country: row.country ?? null,
          photos: row.thumbnail ? [row.thumbnail] : [],
          maxGuests: row.maxGuests ?? null,
          bedrooms: row.bedrooms ?? null,
          bathrooms: row.bathrooms ? String(row.bathrooms) : null,
          raw: row as unknown as Record<string, unknown>,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [listings.workspaceId, listings.connectionId, listings.externalListingId],
          set: {
            repullPropertyId,
            name: row.name ?? null,
            address: row.address ?? null,
            city: row.city ?? null,
            country: row.country ?? null,
            photos: row.thumbnail ? [row.thumbnail] : [],
            maxGuests: row.maxGuests ?? null,
            bedrooms: row.bedrooms ?? null,
            bathrooms: row.bathrooms ? String(row.bathrooms) : null,
            raw: row as unknown as Record<string, unknown>,
            syncedAt: new Date(),
          },
        })
        .returning();
      if (upserted[0]) out.push(upserted[0]);
      stats.listings++;
    }
  } catch (err) {
    stats.errors.push(`properties.list: ${(err as Error).message}`);
  }

  return out;
}

async function syncReservations(
  client: Repull,
  workspaceId: string,
  syncedListings: Listing[],
  stats: SyncStats,
): Promise<void> {
  const limit = 100;
  let offset = 0;
  let total = Infinity;

  while (offset < total && offset < 500) {
    let res: { data?: RepullReservationRow[]; pagination?: { total?: number } } = {};
    try {
      res = (await client.reservations.list({ limit, offset })) as typeof res;
    } catch (err) {
      stats.errors.push(`reservations.list offset=${offset}: ${(err as Error).message}`);
      break;
    }
    const rows = res.data ?? [];
    total = res.pagination?.total ?? rows.length;
    if (rows.length === 0) break;

    for (const row of rows) {
      const externalReservationId = String(row.id ?? row.confirmationCode ?? '');
      if (!externalReservationId) continue;

      // Locate the matching local listing row.
      const matchingListing = syncedListings.find(
        (l) =>
          l.externalListingId === String(row.propertyId ?? '') ||
          l.externalListingId === String(row.externalListingId ?? '') ||
          l.repullPropertyId === String(row.propertyId ?? ''),
      );

      // Upsert guest if we have one.
      let guestId: string | null = null;
      if (row.guestFirstName || row.guestLastName || row.guestEmail) {
        const fullName = [row.guestFirstName, row.guestLastName].filter(Boolean).join(' ').trim();
        const guestRows = await db
          .insert(guests)
          .values({
            workspaceId,
            externalGuestId: row.guestEmail ?? null,
            name: fullName || null,
            email: row.guestEmail ?? null,
            phone: row.guestPhone ?? null,
            raw: row as unknown as Record<string, unknown>,
          })
          .returning();
        guestId = guestRows[0]?.id ?? null;
        stats.guests++;
      }

      // Compute nights if we have both dates.
      let nights: number | null = null;
      if (row.checkIn && row.checkOut) {
        const ms = new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime();
        nights = ms > 0 ? Math.round(ms / (24 * 60 * 60 * 1000)) : null;
      }

      await db
        .insert(reservations)
        .values({
          workspaceId,
          listingId: matchingListing?.id ?? null,
          guestId,
          externalReservationId,
          confirmationCode: row.confirmationCode ?? null,
          platform: row.platform ?? null,
          status: row.status ?? null,
          checkIn: row.checkIn ?? null,
          checkOut: row.checkOut ?? null,
          nights,
          guestCount: row.guestCount ?? null,
          totalPrice: row.totalPrice != null ? String(row.totalPrice) : null,
          currency: row.currency ?? null,
          guestDetails: {
            firstName: row.guestFirstName,
            lastName: row.guestLastName,
            email: row.guestEmail,
            phone: row.guestPhone,
          },
          raw: row as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [reservations.workspaceId, reservations.externalReservationId],
          set: {
            listingId: matchingListing?.id ?? null,
            guestId,
            confirmationCode: row.confirmationCode ?? null,
            platform: row.platform ?? null,
            status: row.status ?? null,
            checkIn: row.checkIn ?? null,
            checkOut: row.checkOut ?? null,
            nights,
            guestCount: row.guestCount ?? null,
            totalPrice: row.totalPrice != null ? String(row.totalPrice) : null,
            currency: row.currency ?? null,
            guestDetails: {
              firstName: row.guestFirstName,
              lastName: row.guestLastName,
              email: row.guestEmail,
              phone: row.guestPhone,
            },
            raw: row as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });
      stats.reservations++;
    }

    offset += rows.length;
  }
}

async function syncCalendarForListing(
  client: Repull,
  workspaceId: string,
  listing: Listing,
  daysAhead: number,
): Promise<number> {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + daysAhead);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  // /v1/availability/{propertyId} requires the integer Repull-side property id.
  // Airbnb-only listings (synced via channels.airbnb.listings.list) won't have
  // one until /v1/properties has been crawled; we back-fill in syncListings.
  // If we still don't have it, fall back to the per-channel availability path.
  const numericPropertyId = listing.repullPropertyId ? Number(listing.repullPropertyId) : NaN;
  let payload: { data?: RepullCalendarDayRow[] } = {};
  if (Number.isFinite(numericPropertyId)) {
    payload = await (client as unknown as {
      request: <T>(method: string, path: string, init?: { query?: Record<string, unknown> }) => Promise<T>;
    }).request('GET', `/v1/availability/${numericPropertyId}`, {
      query: { startDate: startStr, endDate: endStr },
    });
  } else if (listing.connectionId && /^\d+$/.test(listing.externalListingId)) {
    // Airbnb-channel fallback — uses the Airbnb listing id directly.
    payload = await (client as unknown as {
      request: <T>(method: string, path: string) => Promise<T>;
    }).request(
      'GET',
      `/v1/channels/airbnb/listings/${encodeURIComponent(listing.externalListingId)}/availability`,
    );
  } else {
    throw new Error(
      `listing ${listing.externalListingId} has no integer Repull property id — calendar sync requires /v1/properties to populate it first`,
    );
  }

  const rows = payload?.data ?? [];
  if (rows.length === 0) return 0;

  let written = 0;
  for (const day of rows) {
    if (!day.date) continue;
    await db
      .insert(calendarDays)
      .values({
        workspaceId,
        listingId: listing.id,
        date: day.date,
        available: day.available ?? true,
        dailyPrice: day.price != null ? String(day.price) : null,
        minNights: day.minNights ?? null,
        source: 'sync',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [calendarDays.listingId, calendarDays.date],
        set: {
          available: day.available ?? true,
          dailyPrice: day.price != null ? String(day.price) : null,
          minNights: day.minNights ?? null,
          source: 'sync',
          updatedAt: new Date(),
        },
      });
    written++;
  }
  return written;
}

async function openRun(workspaceId: string, kind: 'full' | 'incremental' | 'webhook') {
  const rows = await db
    .insert(syncRuns)
    .values({ workspaceId, kind, status: 'running' })
    .returning();
  return rows[0]!;
}

async function closeRun(
  runId: string,
  status: 'success' | 'partial' | 'error',
  stats: SyncStats,
  error?: string,
) {
  await db
    .update(syncRuns)
    .set({
      finishedAt: new Date(),
      status: stats.errors.length > 0 && status === 'success' ? 'partial' : status,
      stats: stats as unknown as Record<string, unknown>,
      error: error ?? (stats.errors[0] ?? null),
    })
    .where(eq(syncRuns.id, runId));
}
