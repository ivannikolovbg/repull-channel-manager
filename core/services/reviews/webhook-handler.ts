/**
 * Reviews webhook handler — invoked from the central `webhook-handlers.ts`
 * dispatcher when Repull delivers a `review.*` event.
 *
 * Repull events we consume:
 *   - review.created    upsert and mark needs_response (or flagged if low)
 *   - review.updated    upsert; status is preserved by `upsertReview`
 *   - review.responded  marks the local row `responded` (host responded
 *                       outside our UI, e.g. via the channel directly)
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { reviews } from '@/core/db/schema';
import { upsertReview, type NormalisedReview } from './repull-sync';

interface ReviewWebhookPayload {
  reviewId?: string | number;
  id?: string | number;
  listingId?: string | number;
  platform?: string;
  rating?: number;
  publicReview?: string;
  privateFeedback?: string;
  reviewerName?: string;
  reviewerFirstName?: string;
  reviewerLastName?: string;
  reviewerAvatarUrl?: string;
  language?: string;
  submittedAt?: string;
  responseBody?: string;
  responseSubmittedAt?: string;
}

/**
 * Returns true if the event was consumed (i.e. the dispatcher should consider
 * it handled). Returns false for unknown event names so the caller can fall
 * back to its default audit-only behaviour.
 */
export async function handleReviewWebhook(opts: {
  workspaceId: string;
  eventType: string;
  payload: ReviewWebhookPayload;
}): Promise<boolean> {
  const { workspaceId, eventType, payload } = opts;

  if (!eventType.startsWith('review.')) return false;

  const repullReviewId = String(payload.reviewId ?? payload.id ?? '');
  if (!repullReviewId) return false;

  if (eventType === 'review.responded') {
    await db
      .update(reviews)
      .set({ status: 'responded', updatedAt: new Date() })
      .where(
        and(eq(reviews.workspaceId, workspaceId), eq(reviews.repullReviewId, repullReviewId)),
      );
    return true;
  }

  // review.created / review.updated — normalise + upsert.
  const reviewerName =
    payload.reviewerName ??
    [payload.reviewerFirstName, payload.reviewerLastName].filter(Boolean).join(' ').trim() ??
    null;
  const normalised: NormalisedReview = {
    repullReviewId,
    platform: payload.platform ?? 'airbnb',
    externalListingId: payload.listingId != null ? String(payload.listingId) : null,
    guestName: reviewerName || null,
    guestAvatarUrl: payload.reviewerAvatarUrl ?? null,
    rating: payload.rating ?? null,
    categories: null,
    publicReview: payload.publicReview ?? null,
    privateFeedback: payload.privateFeedback ?? null,
    language: payload.language ?? null,
    submittedAt: payload.submittedAt ? new Date(payload.submittedAt) : null,
    raw: payload as unknown as Record<string, unknown>,
  };
  await upsertReview(workspaceId, normalised);
  return true;
}
