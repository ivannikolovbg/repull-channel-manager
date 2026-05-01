/**
 * Drizzle schema for repull-channel-manager.
 *
 * Multi-tenant by `workspaceId`. Every domain table FKs to `workspaces.id`
 * with ON DELETE CASCADE so deleting a workspace cleanly tears down all data.
 *
 * Auth tables (users / accounts / sessions / verification_tokens) follow
 * the @auth/drizzle-adapter conventions so NextAuth wires up out-of-the-box.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Auth tables (NextAuth / @auth/drizzle-adapter shape)
// ============================================================================

export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ============================================================================
// Workspaces — the multi-tenant root
// ============================================================================

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Encrypted Repull API key (AES-GCM). May be plaintext in dev when ENCRYPTION_KEY is unset. */
  repullApiKey: text('repull_api_key'),
  /** Whether the stored key is encrypted (GCM ciphertext) or plaintext. */
  repullApiKeyEncrypted: boolean('repull_api_key_encrypted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Workspace membership — for v1 only the owner is a member, but the table
 * exists so multi-seat invites are an additive change later.
 */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 32 }).notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
  }),
);

// ============================================================================
// Connections (one per Repull-side OAuth grant: Airbnb, Booking, etc.)
// ============================================================================

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** 'airbnb' | 'booking' | 'vrbo' | 'plumguide' | … */
    provider: varchar('provider', { length: 32 }).notNull(),
    /** Repull-side connection id (number) — stored as text for portability. */
    repullConnectionId: text('repull_connection_id'),
    /** External account id (Airbnb host id, etc.). */
    externalAccountId: text('external_account_id'),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    /** Display info pulled from Repull (avatar, host name, etc.). */
    hostMetadata: jsonb('host_metadata').$type<Record<string, unknown>>(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => ({
    workspaceIdx: uniqueIndex('connections_ws_provider_external_uq').on(
      t.workspaceId,
      t.provider,
      t.externalAccountId,
    ),
  }),
);

// ============================================================================
// Listings
// ============================================================================

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    /** Listing ID in the source channel (Airbnb listing id, Booking property id, …). */
    externalListingId: text('external_listing_id').notNull(),
    /** Repull-side property id — useful for general /v1/properties lookups. */
    repullPropertyId: text('repull_property_id'),
    name: text('name'),
    address: text('address'),
    city: text('city'),
    country: text('country'),
    photos: jsonb('photos').$type<string[]>(),
    maxGuests: integer('max_guests'),
    bedrooms: integer('bedrooms'),
    bathrooms: numeric('bathrooms', { precision: 4, scale: 1 }),
    currency: varchar('currency', { length: 8 }),
    timezone: varchar('timezone', { length: 64 }),
    /** Full raw payload from Repull for forward-compat / debugging. */
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('listings_ws_provider_external_uq').on(
      t.workspaceId,
      t.connectionId,
      t.externalListingId,
    ),
  }),
);

// ============================================================================
// Guests
// ============================================================================

export const guests = pgTable('guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  externalGuestId: text('external_guest_id'),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  country: text('country'),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// Reservations
// ============================================================================

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    /** Repull internal id; primary external identifier. */
    externalReservationId: text('external_reservation_id').notNull(),
    confirmationCode: text('confirmation_code'),
    platform: varchar('platform', { length: 32 }),
    status: varchar('status', { length: 24 }),
    checkIn: date('check_in'),
    checkOut: date('check_out'),
    nights: integer('nights'),
    guestCount: integer('guest_count'),
    totalPrice: numeric('total_price', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 8 }),
    /** Snapshot of the guest fields (denormalised for list/table rendering). */
    guestDetails: jsonb('guest_details').$type<Record<string, unknown>>(),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('reservations_ws_external_uq').on(t.workspaceId, t.externalReservationId),
  }),
);

// ============================================================================
// Calendar
// ============================================================================

export const calendarDays = pgTable(
  'calendar_days',
  {
    id: serial('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    available: boolean('available').notNull().default(true),
    blockedReason: text('blocked_reason'),
    dailyPrice: numeric('daily_price', { precision: 12, scale: 2 }),
    minNights: integer('min_nights'),
    /** 'sync' (from Repull) or 'manual' (set in this UI). */
    source: varchar('source', { length: 16 }).notNull().default('sync'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('calendar_days_listing_date_uq').on(t.listingId, t.date),
  }),
);

// ============================================================================
// Sync runs (audit trail)
// ============================================================================

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  /** 'full' | 'incremental' | 'webhook' */
  kind: varchar('kind', { length: 16 }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  /** 'running' | 'success' | 'partial' | 'error' */
  status: varchar('status', { length: 16 }).notNull().default('running'),
  stats: jsonb('stats').$type<Record<string, unknown>>(),
  error: text('error'),
});

// ============================================================================
// Webhook events (raw audit log)
// ============================================================================

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
});

// ============================================================================
// Relations
// ============================================================================

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  owner: one(users, { fields: [workspaces.ownerUserId], references: [users.id] }),
  members: many(workspaceMembers),
  connections: many(connections),
  listings: many(listings),
  reservations: many(reservations),
}));

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [connections.workspaceId], references: [workspaces.id] }),
  listings: many(listings),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [listings.workspaceId], references: [workspaces.id] }),
  connection: one(connections, { fields: [listings.connectionId], references: [connections.id] }),
  reservations: many(reservations),
  calendarDays: many(calendarDays),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  workspace: one(workspaces, { fields: [reservations.workspaceId], references: [workspaces.id] }),
  listing: one(listings, { fields: [reservations.listingId], references: [listings.id] }),
  guest: one(guests, { fields: [reservations.guestId], references: [guests.id] }),
}));

export const calendarDaysRelations = relations(calendarDays, ({ one }) => ({
  workspace: one(workspaces, { fields: [calendarDays.workspaceId], references: [workspaces.id] }),
  listing: one(listings, { fields: [calendarDays.listingId], references: [listings.id] }),
}));

// Convenience exports for typing
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
export type CalendarDay = typeof calendarDays.$inferSelect;
export type NewCalendarDay = typeof calendarDays.$inferInsert;
export type SyncRun = typeof syncRuns.$inferSelect;
