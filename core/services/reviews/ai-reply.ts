/**
 * AI review-reply generator.
 *
 * Hosts use this to draft a polished, on-brand response to a guest review in
 * one click. We return TWO variants with distinct tones so the user can pick
 * the one that fits the situation — never auto-send.
 *
 * Pipeline:
 *   1. Build a context prompt from the review + listing facts.
 *   2. Try Repull's hosted AI surface (`POST /v1/ai`, operation
 *      `review-response`). Always preferred — uses the workspace's billed
 *      AI quota and inherits whatever model Repull standardises on.
 *   3. If Repull's AI surface 4xx/5xx (or returns an empty body), fall back
 *      to a deterministic local template that uses the same context. This
 *      keeps the demo always-interactive even with a stub API key.
 *
 * Tagged "Powered by Vanio AI" in the UI to make the differentiator visible.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { listings, reviews, type Review } from '@/core/db/schema';
import { getRepullForWorkspace } from '../repull-client';

export type ReplyTone = 'warm' | 'concise';

export interface ReplySuggestion {
  tone: ReplyTone;
  /** Human-readable label for the UI card. */
  label: string;
  /** Why this tone was picked — shown beneath the card title. */
  rationale: string;
  /** The drafted response body. */
  body: string;
  /** Where the text came from — useful for analytics + debugging. */
  source: 'repull-ai' | 'fallback';
}

/** Generate the two suggestion variants for a review. */
export async function suggestReplies(
  workspaceId: string,
  reviewId: string,
): Promise<ReplySuggestion[]> {
  const ctx = await loadContext(workspaceId, reviewId);
  if (!ctx) throw new Error(`review ${reviewId} not found in workspace ${workspaceId}`);

  const tones: ReplyTone[] = ['warm', 'concise'];
  const out: ReplySuggestion[] = [];
  for (const tone of tones) {
    const text = await generateOne(workspaceId, ctx, tone).catch(() => null);
    if (text && text.body) {
      out.push(text);
    } else {
      out.push(fallbackSuggestion(ctx, tone));
    }
  }
  return out;
}

interface ReviewContext {
  review: Review;
  listingName: string | null;
  listingCity: string | null;
  listingCountry: string | null;
  listingBedrooms: number | null;
  listingMaxGuests: number | null;
}

async function loadContext(
  workspaceId: string,
  reviewId: string,
): Promise<ReviewContext | null> {
  const rows = await db
    .select({
      r: reviews,
      listingName: listings.name,
      listingCity: listings.city,
      listingCountry: listings.country,
      listingBedrooms: listings.bedrooms,
      listingMaxGuests: listings.maxGuests,
    })
    .from(reviews)
    .leftJoin(listings, eq(listings.id, reviews.listingId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  const row = rows[0];
  if (!row || row.r.workspaceId !== workspaceId) return null;
  return {
    review: row.r,
    listingName: row.listingName ?? null,
    listingCity: row.listingCity ?? null,
    listingCountry: row.listingCountry ?? null,
    listingBedrooms: row.listingBedrooms ?? null,
    listingMaxGuests: row.listingMaxGuests ?? null,
  };
}

async function generateOne(
  workspaceId: string,
  ctx: ReviewContext,
  tone: ReplyTone,
): Promise<ReplySuggestion | null> {
  const client = await getRepullForWorkspace(workspaceId).catch(() => null);
  if (!client) return null;

  const prompt = buildPrompt(ctx, tone);
  try {
    const res = await (
      client as unknown as {
        request: <T>(method: string, path: string, init?: { body?: unknown }) => Promise<T>;
      }
    ).request<{ result?: string }>('POST', '/v1/ai', {
      body: {
        operation: 'review-response',
        input: prompt,
      },
    });
    const body = res?.result?.trim();
    if (!body) return null;
    return {
      tone,
      label: tone === 'warm' ? 'Warm' : 'Concise',
      rationale: rationaleFor(tone, ctx),
      body,
      source: 'repull-ai',
    };
  } catch {
    return null;
  }
}

function buildPrompt(ctx: ReviewContext, tone: ReplyTone): Record<string, unknown> {
  const ratingNum = ctx.review.rating ? Number(ctx.review.rating) : null;
  return {
    tone,
    review: {
      rating: ratingNum,
      public: ctx.review.publicReview ?? '',
      private: ctx.review.privateFeedback ?? '',
      language: ctx.review.language ?? 'en',
      categories: ctx.review.categories ?? {},
      platform: ctx.review.platform,
      guestName: ctx.review.guestName ?? null,
    },
    listing: {
      name: ctx.listingName,
      city: ctx.listingCity,
      country: ctx.listingCountry,
      bedrooms: ctx.listingBedrooms,
      maxGuests: ctx.listingMaxGuests,
    },
    instructions: systemInstructions(tone, ratingNum),
  };
}

function systemInstructions(tone: ReplyTone, rating: number | null): string {
  const lowRating = rating != null && rating <= 3;
  const base =
    'You are writing the host\'s public response to a guest review. ' +
    'Stay in the host\'s voice. Address the guest by first name when known. ' +
    'Never invent details about the property. Keep responses under 400 characters. ' +
    'Plain text only — no markdown, no emoji.';
  if (tone === 'warm') {
    return [
      base,
      lowRating
        ? 'Lead with empathy. Acknowledge the specific issue raised. Briefly state what was done or will change. Invite the guest to come back.'
        : 'Lead with gratitude. Echo one specific thing the guest enjoyed. Invite them back warmly.',
    ].join(' ');
  }
  return [
    base,
    lowRating
      ? 'Be respectful and direct. Acknowledge the issue in one sentence, state the fix in one sentence. No fluff.'
      : 'Be brief and professional. Two sentences max — thank them, invite them back. No extra small talk.',
  ].join(' ');
}

function rationaleFor(tone: ReplyTone, ctx: ReviewContext): string {
  const ratingNum = ctx.review.rating ? Number(ctx.review.rating) : null;
  if (tone === 'warm') {
    return ratingNum != null && ratingNum <= 3
      ? 'Acknowledges the issue and offers a remedy.'
      : 'Builds the relationship — thanks the guest by name and invites them back.';
  }
  return ratingNum != null && ratingNum <= 3
    ? 'Direct and respectful — owns the issue without over-apologising.'
    : 'Quick and professional — keeps the response short and on-brand.';
}

// ---------- Local fallback ----------

function fallbackSuggestion(ctx: ReviewContext, tone: ReplyTone): ReplySuggestion {
  const guestFirst = (ctx.review.guestName ?? 'there').split(/\s+/)[0] ?? 'there';
  const ratingNum = ctx.review.rating ? Number(ctx.review.rating) : null;
  const lowRating = ratingNum != null && ratingNum <= 3;
  const place = ctx.listingName ?? 'our place';
  const city = ctx.listingCity ?? null;

  let body: string;
  if (tone === 'warm') {
    body = lowRating
      ? `Hi ${guestFirst}, thank you for the honest feedback — I'm sorry your stay didn't ` +
        `meet expectations. We've taken your notes to heart and are already addressing ` +
        `them so the next guest has a better experience. ${
          city ? `If you give ${city} another chance,` : 'If you stay with us again,'
        } I'd love the opportunity to host you properly. — The host`
      : `Thank you so much, ${guestFirst}! It was a pleasure hosting you at ${place}. ` +
        `Reviews like yours are what keep us going. ${
          city ? `Come back to ${city} anytime —` : 'Come back anytime —'
        } you'll always have a warm welcome here.`;
  } else {
    body = lowRating
      ? `Thanks for the feedback, ${guestFirst}. We've noted your concerns and have ` +
        `addressed them. Hope you'll consider giving us another try.`
      : `Thank you, ${guestFirst} — glad you enjoyed ${place}. You're welcome back anytime.`;
  }

  return {
    tone,
    label: tone === 'warm' ? 'Warm' : 'Concise',
    rationale: rationaleFor(tone, ctx),
    body,
    source: 'fallback',
  };
}
