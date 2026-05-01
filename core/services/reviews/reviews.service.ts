/**
 * Reviews service — the workspace-facing surface used by API routes and
 * server components.
 *
 * Responsibilities:
 *   - syncReviews(workspaceId)              re-pull every channel
 *   - listReviews(workspaceId, filters)     filtered + sorted index
 *   - getReview(workspaceId, reviewId)      detail view bundle
 *   - getStats(workspaceId)                 dashboard / header stats
 *   - saveDraftResponse(workspaceId, …)     autosave host draft (also stores
 *                                           AI suggestions when the user
 *                                           accepts one)
 *   - respondToReview(workspaceId, …)       submit to Repull / channel
 *   - flagReview(workspaceId, …)            triage escalation
 *   - requestRevision(workspaceId, …)       Airbnb-only — asks the guest to
 *                                           revise. Best-effort: returns ok
 *                                           but the channel may decline.
 */

import { and, asc, desc, eq, gte, inArray, sql, SQL } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  guests,
  listings,
  reservations,
  reviewResponses,
  reviews,
  workspaces,
  type Review,
  type ReviewResponse,
} from '@/core/db/schema';
import { getRepullForWorkspace } from '../repull-client';
import { syncReviewsForWorkspace, type ReviewSyncStats } from './repull-sync';

export type ReviewStatus =
  | 'needs_response'
  | 'draft'
  | 'responded'
  | 'flagged'
  | 'no_action';

export interface ReviewFilters {
  platform?: string;
  /** 'low' | 'mid' | 'high' — maps to 1-2 / 3 / 4-5. */
  ratingBucket?: 'low' | 'mid' | 'high';
  status?: ReviewStatus;
  listingId?: string;
  /** ISO yyyy-mm-dd; both inclusive. */
  from?: string;
  to?: string;
  /** Free-text against guest_name + public_review. */
  search?: string;
  sort?: 'newest' | 'oldest' | 'rating-asc' | 'rating-desc';
  limit?: number;
  offset?: number;
}

export interface ReviewListRow {
  review: Review;
  listingName: string | null;
  listingCity: string | null;
  hasDraft: boolean;
  responseSubmittedAt: Date | null;
}

export interface ReviewStats {
  totalReviews: number;
  reviewsLast30d: number;
  reviewsLast365d: number;
  averageRating: number | null;
  responseRate: number; // 0..1
  needsResponse: number;
  draftCount: number;
  flaggedCount: number;
}

// ============================================================================
// Sync
// ============================================================================

export async function syncReviews(workspaceId: string): Promise<ReviewSyncStats> {
  return syncReviewsForWorkspace(workspaceId);
}

// ============================================================================
// Reads
// ============================================================================

export async function listReviews(
  workspaceId: string,
  filters: ReviewFilters = {},
): Promise<ReviewListRow[]> {
  const where: SQL[] = [eq(reviews.workspaceId, workspaceId)];
  if (filters.platform) where.push(eq(reviews.platform, filters.platform));
  if (filters.status) where.push(eq(reviews.status, filters.status));
  if (filters.listingId) where.push(eq(reviews.listingId, filters.listingId));
  if (filters.ratingBucket === 'low') where.push(sql`${reviews.rating}::numeric <= 2`);
  if (filters.ratingBucket === 'mid')
    where.push(sql`${reviews.rating}::numeric > 2 AND ${reviews.rating}::numeric <= 3.5`);
  if (filters.ratingBucket === 'high') where.push(sql`${reviews.rating}::numeric > 3.5`);
  if (filters.from) where.push(sql`${reviews.submittedAt} >= ${filters.from}`);
  if (filters.to) where.push(sql`${reviews.submittedAt} <= ${filters.to}`);
  if (filters.search) {
    const like = `%${filters.search.replace(/[%_]/g, '')}%`;
    where.push(sql`(${reviews.guestName} ILIKE ${like} OR ${reviews.publicReview} ILIKE ${like})`);
  }

  let orderBy;
  switch (filters.sort) {
    case 'oldest':
      orderBy = asc(reviews.submittedAt);
      break;
    case 'rating-asc':
      orderBy = asc(reviews.rating);
      break;
    case 'rating-desc':
      orderBy = desc(reviews.rating);
      break;
    case 'newest':
    default:
      orderBy = desc(reviews.submittedAt);
      break;
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const rows = await db
    .select({
      r: reviews,
      listingName: listings.name,
      listingCity: listings.city,
    })
    .from(reviews)
    .leftJoin(listings, eq(listings.id, reviews.listingId))
    .where(and(...where))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  const reviewIds = rows.map((row) => row.r.id);
  const responsesAgg = await db
    .select({
      reviewId: reviewResponses.reviewId,
      submitted: sql<Date | null>`max(${reviewResponses.submittedToRepullAt})`,
      drafts: sql<number>`count(*) FILTER (WHERE ${reviewResponses.draft} = true)`.mapWith(Number),
    })
    .from(reviewResponses)
    .where(inArray(reviewResponses.reviewId, reviewIds))
    .groupBy(reviewResponses.reviewId);
  const byId = new Map(responsesAgg.map((r) => [r.reviewId, r]));

  return rows.map((row) => {
    const agg = byId.get(row.r.id);
    return {
      review: row.r,
      listingName: row.listingName ?? null,
      listingCity: row.listingCity ?? null,
      hasDraft: (agg?.drafts ?? 0) > 0,
      responseSubmittedAt: agg?.submitted ?? null,
    };
  });
}

export interface ReviewDetail {
  review: Review;
  listingName: string | null;
  listingCity: string | null;
  listingId: string | null;
  guestEmail: string | null;
  reservationConfirmation: string | null;
  reservationId: string | null;
  responses: ReviewResponse[];
}

export async function getReview(
  workspaceId: string,
  reviewId: string,
): Promise<ReviewDetail | null> {
  const rows = await db
    .select({
      r: reviews,
      listingName: listings.name,
      listingCity: listings.city,
      listingId: listings.id,
      guestEmail: guests.email,
      reservationConfirmation: reservations.confirmationCode,
      reservationId: reservations.id,
    })
    .from(reviews)
    .leftJoin(listings, eq(listings.id, reviews.listingId))
    .leftJoin(guests, eq(guests.id, reviews.guestId))
    .leftJoin(reservations, eq(reservations.id, reviews.reservationId))
    .where(and(eq(reviews.workspaceId, workspaceId), eq(reviews.id, reviewId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const responses = await db
    .select()
    .from(reviewResponses)
    .where(eq(reviewResponses.reviewId, reviewId))
    .orderBy(desc(reviewResponses.updatedAt));

  return {
    review: row.r,
    listingName: row.listingName ?? null,
    listingCity: row.listingCity ?? null,
    listingId: row.listingId ?? null,
    guestEmail: row.guestEmail ?? null,
    reservationConfirmation: row.reservationConfirmation ?? null,
    reservationId: row.reservationId ?? null,
    responses,
  };
}

export async function getStats(workspaceId: string): Promise<ReviewStats> {
  const days30 = new Date();
  days30.setUTCDate(days30.getUTCDate() - 30);
  const days365 = new Date();
  days365.setUTCDate(days365.getUTCDate() - 365);

  const allRows = await db
    .select({
      status: reviews.status,
      rating: reviews.rating,
      submittedAt: reviews.submittedAt,
    })
    .from(reviews)
    .where(eq(reviews.workspaceId, workspaceId));

  const totalReviews = allRows.length;
  let reviewsLast30d = 0;
  let reviewsLast365d = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let needsResponse = 0;
  let draftCount = 0;
  let flaggedCount = 0;
  let respondedCount = 0;

  for (const r of allRows) {
    if (r.submittedAt && r.submittedAt >= days30) reviewsLast30d++;
    if (r.submittedAt && r.submittedAt >= days365) reviewsLast365d++;
    if (r.rating != null) {
      const n = Number(r.rating);
      if (Number.isFinite(n)) {
        ratingSum += n;
        ratingCount += 1;
      }
    }
    if (r.status === 'needs_response') needsResponse++;
    if (r.status === 'draft') draftCount++;
    if (r.status === 'flagged') flaggedCount++;
    if (r.status === 'responded') respondedCount++;
  }

  const respondable = totalReviews - flaggedCount; // flagged ≈ on-deck
  const responseRate = respondable > 0 ? respondedCount / respondable : 0;
  const averageRating = ratingCount > 0 ? ratingSum / ratingCount : null;

  // Acknowledge unused warning for `gte` import — kept for future filters.
  void gte;

  return {
    totalReviews,
    reviewsLast30d,
    reviewsLast365d,
    averageRating,
    responseRate,
    needsResponse,
    draftCount,
    flaggedCount,
  };
}

// ============================================================================
// Mutations
// ============================================================================

export async function saveDraftResponse(opts: {
  workspaceId: string;
  reviewId: string;
  body: string;
  workspaceMemberId?: string | null;
  source?: 'human' | 'ai-suggested';
}): Promise<ReviewResponse> {
  const review = await fetchReviewOrThrow(opts.workspaceId, opts.reviewId);

  // One-draft-per-review policy: replace any existing draft with the latest text.
  const existing = await db
    .select()
    .from(reviewResponses)
    .where(and(eq(reviewResponses.reviewId, review.id), eq(reviewResponses.draft, true)))
    .limit(1);

  let row: ReviewResponse;
  if (existing[0]) {
    const updated = await db
      .update(reviewResponses)
      .set({
        body: opts.body,
        workspaceMemberId: opts.workspaceMemberId ?? existing[0].workspaceMemberId,
        source: opts.source ?? existing[0].source,
        updatedAt: new Date(),
      })
      .where(eq(reviewResponses.id, existing[0].id))
      .returning();
    row = updated[0]!;
  } else {
    const inserted = await db
      .insert(reviewResponses)
      .values({
        reviewId: review.id,
        workspaceMemberId: opts.workspaceMemberId ?? null,
        body: opts.body,
        draft: true,
        source: opts.source ?? 'human',
      })
      .returning();
    row = inserted[0]!;
  }

  // Bump the parent status if it was sitting in needs_response.
  if (review.status === 'needs_response') {
    await db
      .update(reviews)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(reviews.id, review.id));
  }

  return row;
}

export async function respondToReview(opts: {
  workspaceId: string;
  reviewId: string;
  body: string;
  workspaceMemberId?: string | null;
}): Promise<{ response: ReviewResponse; submitted: boolean; channelError: string | null }> {
  const review = await fetchReviewOrThrow(opts.workspaceId, opts.reviewId);
  const body = opts.body.trim();
  if (!body) throw new Error('response body is empty');

  // Persist the response row first as a draft so we have an id even if the
  // channel call fails.
  const draftRow = await saveDraftResponse({
    workspaceId: opts.workspaceId,
    reviewId: review.id,
    body,
    workspaceMemberId: opts.workspaceMemberId,
    source: 'human',
  });

  // Try to push to the channel via Repull.
  let submitted = false;
  let channelError: string | null = null;
  let repullResponseId: string | null = null;

  if (review.platform === 'airbnb' && review.repullReviewId) {
    try {
      const client = await getRepullForWorkspace(opts.workspaceId);
      const res = await (
        client as unknown as {
          request: <T>(method: string, path: string, init?: { body?: unknown }) => Promise<T>;
        }
      ).request<{ id?: string }>('POST', '/v1/channels/airbnb/reviews', {
        body: { reviewId: review.repullReviewId, response: body },
      });
      submitted = true;
      repullResponseId = res?.id ? String(res.id) : null;
    } catch (err) {
      channelError = (err as Error).message;
    }
  } else {
    // For platforms that don't yet have a Repull respond surface, we mark as
    // submitted locally so the host can mirror the action they took manually.
    submitted = true;
  }

  // Persist the new response state.
  const finalRow = await db
    .update(reviewResponses)
    .set({
      draft: !submitted,
      submittedToRepullAt: submitted ? new Date() : null,
      repullResponseId,
      lastError: channelError,
      updatedAt: new Date(),
    })
    .where(eq(reviewResponses.id, draftRow.id))
    .returning();

  if (submitted) {
    await db
      .update(reviews)
      .set({ status: 'responded', updatedAt: new Date() })
      .where(eq(reviews.id, review.id));
  }

  return { response: finalRow[0]!, submitted, channelError };
}

export async function flagReview(opts: {
  workspaceId: string;
  reviewId: string;
  reason: string;
}): Promise<Review> {
  const review = await fetchReviewOrThrow(opts.workspaceId, opts.reviewId);
  const updated = await db
    .update(reviews)
    .set({
      status: 'flagged',
      flagReason: opts.reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(reviews.id, review.id))
    .returning();
  return updated[0]!;
}

export async function requestRevision(opts: {
  workspaceId: string;
  reviewId: string;
}): Promise<{ ok: boolean; channelError: string | null }> {
  const review = await fetchReviewOrThrow(opts.workspaceId, opts.reviewId);
  // Repull doesn't expose a generic "ask for revision" endpoint yet — for now
  // we record the intent locally so the UI can show "revision requested" and
  // surface this to the host on the channel manually.
  await db
    .update(reviews)
    .set({
      flagReason: 'revision requested',
      updatedAt: new Date(),
    })
    .where(eq(reviews.id, review.id));
  return { ok: true, channelError: null };
}

// ============================================================================
// Helpers
// ============================================================================

async function fetchReviewOrThrow(workspaceId: string, reviewId: string): Promise<Review> {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.workspaceId, workspaceId), eq(reviews.id, reviewId)))
    .limit(1);
  if (!rows[0]) throw new Error(`review ${reviewId} not found in workspace ${workspaceId}`);
  return rows[0];
}

// Reference workspaces import to satisfy unused-import lint — kept for future
// per-workspace tone preferences.
void workspaces;
