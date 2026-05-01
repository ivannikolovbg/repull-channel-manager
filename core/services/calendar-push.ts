/**
 * Push a single calendar-day override back to Repull.
 *
 *   PUT /v1/availability/{propertyId}
 *   body: { dates: [{ date, available, price?, minNights? }] }
 *
 * Returns success/failure metadata so the caller can update the badge state on
 * the calendar grid (green "Synced to Repull · {timestamp}" vs orange
 * "Local-only" + retry button).
 *
 * The Repull `propertyId` path parameter is an integer — we pull it from
 * `listings.repullPropertyId`. If the listing was synced via the Airbnb-channel
 * shortcut and never via `/v1/properties`, the column is null and we cannot
 * push back. The caller surfaces a helpful error in that case.
 */

import { Repull } from '@repull/sdk';
import type { Listing } from '@/core/db/schema';

export interface CalendarPushPayload {
  date: string;
  available: boolean;
  dailyPrice: number | null;
  minNights: number | null;
}

export interface CalendarPushResult {
  ok: boolean;
  error?: string;
}

export async function pushCalendarOverride(opts: {
  client: Repull;
  listing: Listing;
  payload: CalendarPushPayload;
}): Promise<CalendarPushResult> {
  const propertyId = opts.listing.repullPropertyId;
  if (!propertyId) {
    return {
      ok: false,
      error:
        'Listing has no Repull-side property id yet. Run a sync (the dashboard "Sync now" button) so /v1/properties can populate it, then retry.',
    };
  }

  const numericId = Number(propertyId);
  if (!Number.isFinite(numericId)) {
    return {
      ok: false,
      error: `Listing's Repull property id (${propertyId}) is not numeric — Repull expects an integer.`,
    };
  }

  const dateEntry: Record<string, unknown> = {
    date: opts.payload.date,
    available: opts.payload.available,
  };
  if (opts.payload.dailyPrice != null) dateEntry.price = opts.payload.dailyPrice;
  if (opts.payload.minNights != null) dateEntry.minNights = opts.payload.minNights;

  try {
    await (opts.client as unknown as {
      request: <T>(method: string, path: string, init?: { body?: unknown }) => Promise<T>;
    }).request('PUT', `/v1/availability/${numericId}`, {
      body: { dates: [dateEntry] },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
