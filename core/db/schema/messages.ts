/**
 * Messaging schema — guest conversations + messages + per-user drafts.
 *
 * Three tables:
 *   - conversations    one row per Repull-side conversation (Airbnb thread,
 *                      Booking.com message thread, direct booking, …)
 *   - messages         the individual notes inside a conversation
 *   - message_drafts   per-(conversation, member) autosave so the compose box
 *                      survives accidental tab closes / refreshes
 *
 * Multi-tenant by `workspace_id`. Conversations cascade on workspace delete;
 * messages cascade on conversation delete.
 *
 * NOTE: this file is re-exported from `core/db/schema.ts` so that the
 * existing `drizzle.config.ts` (which only points at the single schema file)
 * still finds these tables when generating migrations.
 */

import { relations } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// We intentionally import the FK targets from the parent schema file rather
// than redefining them here. This keeps relational integrity tight without
// duplicating column definitions.
import {
  guests,
  listings,
  reservations,
  workspaces,
} from '../schema';

// ============================================================================
// conversations
// ============================================================================

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Repull-side conversation id (string). Unique per workspace. */
    repullConversationId: text('repull_conversation_id'),
    /** 'airbnb' | 'booking' | 'vrbo' | 'direct' | 'other' */
    platform: varchar('platform', { length: 32 }).notNull().default('other'),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    subject: text('subject'),
    /** Denormalised for the inbox row — refreshed on every new message. */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    unreadCount: integer('unread_count').notNull().default(0),
    /** 'open' | 'archived' | 'spam' */
    status: varchar('status', { length: 16 }).notNull().default('open'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('conversations_ws_repull_uq').on(t.workspaceId, t.repullConversationId),
  }),
);

// ============================================================================
// messages
// ============================================================================

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Repull-side message id. Unique per conversation when present. */
    repullMessageId: text('repull_message_id'),
    /** 'inbound' (from guest) | 'outbound' (from host / our user) */
    direction: varchar('direction', { length: 16 }).notNull(),
    senderName: text('sender_name'),
    senderAvatarUrl: text('sender_avatar_url'),
    body: text('body').notNull(),
    attachments: jsonb('attachments')
      .$type<Array<{ url: string; name?: string; mime?: string; sizeBytes?: number }>>()
      .default([]),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('messages_conversation_repull_uq').on(t.conversationId, t.repullMessageId),
  }),
);

// ============================================================================
// message_drafts — autosave-as-you-type per (conversation, workspace member)
// ============================================================================

export const messageDrafts = pgTable(
  'message_drafts',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** workspace_members has a composite PK; we key by user_id directly here. */
    userId: text('user_id').notNull(),
    body: text('body').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.conversationId, t.userId] }),
  }),
);

// ============================================================================
// Relations
// ============================================================================

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [conversations.workspaceId], references: [workspaces.id] }),
  guest: one(guests, { fields: [conversations.guestId], references: [guests.id] }),
  listing: one(listings, { fields: [conversations.listingId], references: [listings.id] }),
  reservation: one(reservations, {
    fields: [conversations.reservationId],
    references: [reservations.id],
  }),
  messages: many(messages),
  drafts: many(messageDrafts),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const messageDraftsRelations = relations(messageDrafts, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messageDrafts.conversationId],
    references: [conversations.id],
  }),
}));

// (We deliberately don't reference workspaceMembers here — drafts can outlive
// a member and get cascaded with the conversation, so no hard FK is needed.)

// ============================================================================
// Type exports
// ============================================================================

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageDraft = typeof messageDrafts.$inferSelect;
export type NewMessageDraft = typeof messageDrafts.$inferInsert;
