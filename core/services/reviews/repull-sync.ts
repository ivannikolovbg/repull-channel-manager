/**
 * Reviews sync — pulls reviews from every channel that exposes a reviews
 * endpoint on Repull, normalises them to one shape, and upserts into the
 * local `reviews` table.
 *
 * Channel coverage (live as of api.repull.dev):
 *   - Airbnb         GET /v1/channels/airbnb/reviews   (operationId: list_airbnb_reviews)
 *   - Booking.com    no review surface yet — we keep any local rows untouched
 *   - VRBO           no review surface yet — same
 *
 * For non-Airbnb platforms the local table is the source of truth. Direct /
 * website reviews enter via the webhook handler or the seeder.
 *
 * All writes are idempotent (`ON CONFLICT DO UPDATE` keyed by
 * `(workspace_id, repull_review_id)`).
 */

import { and, eq } from 'drizzle-orm';
import { Repull } from '@repull/sdk';
import { db } from '@/core/db';
import { listings, reviews } from '@/core/db/schema';
import { getRepullForWorkspace } from '../repull-client';

export interface ReviewSyncStats {
  fetched: number;
  upserted: number;
  errors: string[];
}

/** Normalised shape we pass to `upsertReview`. */
export interface NormalisedReview {
  repullReviewId: string;
  platform: string;
  externalListingId?: string | null;
  guestName?: string | null;
  guestAvatarUrl?: string | null;
  rating?: number | null;
  categories?: Record<string, number> | null;
  publicReview?: string | null;
  privateFeedback?: string | null;
  language?: string | null;
  submittedAt?: Date | null;
  raw?: Record<string, unknown> | null;
}

/** Raw shape we expect from `GET /v1/channels/airbnb/reviews`. */
interface AirbnbReviewRow {
  id?: string | number;
  reviewId?: string | number;
  listingId?: string | number;
  reservationCode?: string;
  reservationId?: string | number;
  reviewerFirstName?: string;
  reviewerLastName?: string;
  reviewerName?: string;
  reviewerAvatarUrl?: string;
  rating?: number;
  overallRating?: number;
  categoryRatings?: Record<string, number>;
  publicReview?: string;
  reviewText?: string;
  privateFeedback?: string;
  language?: string;
  submittedAt?: string;
  createdAt?: string;
  response?: { body?: string; submittedAt?: string } | null;
}

/**
 * Public entry point. Best-effort across providers — never throws on a
 * single-channel failure; errors land in `stats.errors`.
 */
export async function syncReviewsForWorkspace(workspaceId: string): Promise<ReviewSyncStats> {
  const stats: ReviewSyncStats = { fetched: 0, upserted: 0, errors: [] };
  const client = await getRepullForWorkspace(workspaceId);

  await syncAirbnbReviews(client, workspaceId, stats);

  return stats;
}

async function syncAirbnbReviews(
  client: Repull,
  workspaceId: string,
  stats: ReviewSyncStats,
): Promise<void> {
  let payload: { data?: AirbnbReviewRow[] } | AirbnbReviewRow[] | undefined;
  try {
    payload = await (
      client as unknown as {
        request: <T>(method: string, path: string) => Promise<T>;
      }
    ).request('GET', '/v1/channels/airbnb/reviews');
  } catch (err) {
    stats.errors.push(`channels.airbnb.reviews.list: ${(err as Error).message}`);
    return;
  }

  const rows: AirbnbReviewRow[] = Array.isArray(payload)
    ? payload
    : (payload?.data ?? []);

  for (const row of rows) {
    stats.fetched += 1;
    try {
      await upsertReview(workspaceId, normaliseAirbnb(row));
      stats.upserted += 1;
    } catch (err) {
      stats.errors.push(`upsert review ${row.id ?? row.reviewId}: ${(err as Error).message}`);
    }
  }
}

function normaliseAirbnb(row: AirbnbReviewRow): NormalisedReview {
  const reviewerName =
    row.reviewerName ??
    [row.reviewerFirstName, row.reviewerLastName].filter(Boolean).join(' ').trim() ??
    null;
  const ratingNum = row.rating ?? row.overallRating ?? null;
  return {
    repullReviewId: String(row.reviewId ?? row.id ?? ''),
    platform: 'airbnb',
    externalListingId: row.listingId != null ? String(row.listingId) : null,
    guestName: reviewerName || null,
    guestAvatarUrl: row.reviewerAvatarUrl ?? null,
    rating: ratingNum,
    categories: row.categoryRatings ?? null,
    publicReview: row.publicReview ?? row.reviewText ?? null,
    privateFeedback: row.privateFeedback ?? null,
    language: row.language ?? null,
    submittedAt: row.submittedAt
      ? new Date(row.submittedAt)
      : row.createdAt
        ? new Date(row.createdAt)
        : null,
    raw: row as unknown as Record<string, unknown>,
  };
}

/** Upsert + best-effort listing-id resolution. Idempotent. */
export async function upsertReview(
  workspaceId: string,
  input: NormalisedReview,
): Promise<void> {
  let listingId: string | null = null;
  if (input.externalListingId) {
    const matches = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.workspaceId, workspaceId),
          eq(listings.externalListingId, input.externalListingId),
        ),
      )
      .limit(1);
    listingId = matches[0]?.id ?? null;
  }

  const ratingStr = input.rating != null ? String(input.rating) : null;
  const initialStatus =
    input.rating != null && input.rating <= 3 ? 'flagged' : 'needs_response';
  const flagReason =
    initialStatus === 'flagged' ? `low rating (${input.rating?.toFixed(1)}/5)` : null;

  await db
    .insert(reviews)
    .values({
      workspaceId,
      repullReviewId: input.repullReviewId,
      platform: input.platform,
      listingId,
      guestName: input.guestName ?? null,
      guestAvatarUrl: input.guestAvatarUrl ?? null,
      rating: ratingStr,
      categories: input.categories ?? null,
      publicReview: input.publicReview ?? null,
      privateFeedback: input.privateFeedback ?? null,
      language: input.language ?? null,
      status: initialStatus,
      flagReason,
      submittedAt: input.submittedAt ?? null,
      raw: input.raw ?? null,
    })
    .onConflictDoUpdate({
      target: [reviews.workspaceId, reviews.repullReviewId],
      set: {
        platform: input.platform,
        listingId,
        guestName: input.guestName ?? null,
        guestAvatarUrl: input.guestAvatarUrl ?? null,
        rating: ratingStr,
        categories: input.categories ?? null,
        publicReview: input.publicReview ?? null,
        privateFeedback: input.privateFeedback ?? null,
        language: input.language ?? null,
        // Don't clobber human-set status (responded / draft / flagged) when
        // re-syncing — only refresh content fields.
        submittedAt: input.submittedAt ?? null,
        raw: input.raw ?? null,
        updatedAt: new Date(),
      },
    });
}
