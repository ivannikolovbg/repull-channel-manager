/**
 * Reviews schema — guest reviews + host responses.
 *
 * Two tables:
 *   - reviews            one row per channel review (Airbnb, Booking, VRBO, …)
 *                        keyed on `repull_review_id` so re-syncs are idempotent
 *   - review_responses   host responses (and AI-generated drafts) for each
 *                        review. A review can have multiple draft attempts but
 *                        typically one submitted response.
 *
 * Multi-tenant by `workspace_id`. Reviews cascade on workspace delete; responses
 * cascade on review delete. Listing FK is `set null` so deleting a listing
 * keeps the historical review in the timeline.
 *
 * NOTE: this file is re-exported from `core/db/schema.ts` so that the existing
 * `drizzle.config.ts` (which only points at the single schema file) still
 * picks these tables up when generating migrations.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  guests,
  listings,
  reservations,
  workspaces,
} from '../schema';

// ============================================================================
// reviews
// ============================================================================

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Repull-side / channel-side review id. Unique per workspace. */
    repullReviewId: text('repull_review_id').notNull(),
    /** 'airbnb' | 'booking' | 'vrbo' | 'plumguide' | 'direct' | … */
    platform: varchar('platform', { length: 32 }).notNull(),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    guestName: text('guest_name'),
    guestAvatarUrl: text('guest_avatar_url'),
    /** 1.0 – 5.0 on a unified scale; platform-specific scales are normalised on ingest. */
    rating: numeric('rating', { precision: 3, scale: 2 }),
    /**
     * Per-category scores from the platform when available, e.g.
     * `{ cleanliness: 5, communication: 4.5, location: 5, value: 4 }`.
     * Stored verbatim — render whichever keys exist.
     */
    categories: jsonb('categories').$type<Record<string, number>>(),
    /** Public review text shown on the platform. */
    publicReview: text('public_review'),
    /** Private feedback to the host (Airbnb only). */
    privateFeedback: text('private_feedback'),
    language: varchar('language', { length: 8 }),
    /**
     * 'needs_response' | 'responded' | 'draft' | 'flagged' | 'no_action'
     * Computed at sync time; refreshed when a response is saved or submitted.
     */
    status: varchar('status', { length: 24 }).notNull().default('needs_response'),
    /** Optional triage reason — e.g. "rating <= 3", "guest mentioned safety". */
    flagReason: text('flag_reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('reviews_ws_repull_uq').on(t.workspaceId, t.repullReviewId),
  }),
);

// ============================================================================
// review_responses
// ============================================================================

export const reviewResponses = pgTable('review_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  /** Author. Nullable for AI-generated drafts that no human has saved yet. */
  workspaceMemberId: text('workspace_member_id'),
  body: text('body').notNull(),
  /** True until submitted to the platform. */
  draft: boolean('draft').notNull().default(true),
  /** Where this draft came from — useful for analytics. */
  source: varchar('source', { length: 16 }).notNull().default('human'),
  /** Set when the response is shipped to Repull / the platform. */
  submittedToRepullAt: timestamp('submitted_to_repull_at', { withTimezone: true }),
  /** Repull-side response id, when the platform returns one we can track. */
  repullResponseId: text('repull_response_id'),
  /** Last known submission error so we can surface it in the UI. */
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Relations
// ============================================================================

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [reviews.workspaceId], references: [workspaces.id] }),
  listing: one(listings, { fields: [reviews.listingId], references: [listings.id] }),
  guest: one(guests, { fields: [reviews.guestId], references: [guests.id] }),
  reservation: one(reservations, {
    fields: [reviews.reservationId],
    references: [reservations.id],
  }),
  responses: many(reviewResponses),
}));

export const reviewResponsesRelations = relations(reviewResponses, ({ one }) => ({
  review: one(reviews, { fields: [reviewResponses.reviewId], references: [reviews.id] }),
}));

// (No hard FK on responses — the table is intentionally member-loose so
// AI-generated drafts can exist without a human author.)

// ============================================================================
// Type exports
// ============================================================================

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewResponse = typeof reviewResponses.$inferSelect;
export type NewReviewResponse = typeof reviewResponses.$inferInsert;
