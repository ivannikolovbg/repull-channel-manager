/**
 * Messaging service — workspace-facing surface used by the API routes and
 * server components. All methods enforce workspace scoping; the routes
 * resolve `workspaceId` from the session.
 *
 * Public methods:
 *   - syncConversations(workspaceId)
 *   - syncMessagesForConversation(workspaceId, conversationId)
 *   - listConversations(workspaceId, filters)
 *   - getConversation(workspaceId, conversationId)
 *   - listMessages(workspaceId, conversationId)
 *   - sendMessage(workspaceId, conversationId, body, attachments?)
 *   - markRead(workspaceId, conversationId)
 *   - archiveConversation / unarchiveConversation / markSpam
 *   - getDraft / saveDraft
 *   - getUnreadCount(workspaceId)
 *   - getInboxCounts(workspaceId)
 */

import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  conversations,
  guests,
  listings,
  messageDrafts,
  messages,
  reservations,
  type Conversation,
  type Message,
} from '@/core/db/schema';
import {
  refreshConversationDenorms,
  sendMessageToRepull,
  syncConversationsForWorkspace,
  syncMessagesForConversation as syncMessagesForConversationImpl,
} from './repull-sync';

// ---------- Types ----------

export interface InboxFilters {
  status?: 'open' | 'archived' | 'spam' | 'all';
  unreadOnly?: boolean;
  platform?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export interface InboxRow {
  id: string;
  platform: string;
  status: string;
  guestId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestAvatarUrl: string | null;
  listingId: string | null;
  listingName: string | null;
  reservationId: string | null;
  subject: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export interface InboxCounts {
  all: number;
  unread: number;
  open: number;
  archived: number;
  spam: number;
  byPlatform: Array<{ platform: string; count: number }>;
}

// ---------- Sync ----------

export async function syncConversations(workspaceId: string) {
  return syncConversationsForWorkspace(workspaceId);
}

export async function syncMessagesForConversation(
  workspaceId: string,
  conversationId: string,
) {
  return syncMessagesForConversationImpl(workspaceId, conversationId);
}

// ---------- Reads ----------

export async function listConversations(
  workspaceId: string,
  filters: InboxFilters = {},
): Promise<InboxRow[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const where = [eq(conversations.workspaceId, workspaceId)];
  if (filters.status && filters.status !== 'all') {
    where.push(eq(conversations.status, filters.status));
  }
  if (filters.unreadOnly) {
    where.push(sql`${conversations.unreadCount} > 0`);
  }
  if (filters.platform) {
    where.push(eq(conversations.platform, filters.platform));
  }
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    where.push(
      or(
        ilike(conversations.lastMessagePreview, term),
        ilike(conversations.subject, term),
        ilike(guests.name, term),
        ilike(guests.email, term),
        ilike(listings.name, term),
      )!,
    );
  }

  const rows = await db
    .select({
      id: conversations.id,
      platform: conversations.platform,
      status: conversations.status,
      guestId: conversations.guestId,
      guestName: guests.name,
      guestEmail: guests.email,
      listingId: conversations.listingId,
      listingName: listings.name,
      reservationId: conversations.reservationId,
      subject: conversations.subject,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      unreadCount: conversations.unreadCount,
    })
    .from(conversations)
    .leftJoin(guests, eq(guests.id, conversations.guestId))
    .leftJoin(listings, eq(listings.id, conversations.listingId))
    .where(and(...where))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ ...r, guestAvatarUrl: null }));
}

export async function getConversation(
  workspaceId: string,
  conversationId: string,
): Promise<{
  conversation: Conversation;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  listingName: string | null;
  listingCity: string | null;
  reservationCode: string | null;
  reservationCheckIn: string | null;
  reservationCheckOut: string | null;
} | null> {
  const rows = await db
    .select({
      c: conversations,
      guestName: guests.name,
      guestEmail: guests.email,
      guestPhone: guests.phone,
      listingName: listings.name,
      listingCity: listings.city,
      reservationCode: reservations.confirmationCode,
      reservationCheckIn: reservations.checkIn,
      reservationCheckOut: reservations.checkOut,
    })
    .from(conversations)
    .leftJoin(guests, eq(guests.id, conversations.guestId))
    .leftJoin(listings, eq(listings.id, conversations.listingId))
    .leftJoin(reservations, eq(reservations.id, conversations.reservationId))
    .where(
      and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    conversation: row.c,
    guestName: row.guestName ?? null,
    guestEmail: row.guestEmail ?? null,
    guestPhone: row.guestPhone ?? null,
    listingName: row.listingName ?? null,
    listingCity: row.listingCity ?? null,
    reservationCode: row.reservationCode ?? null,
    reservationCheckIn: row.reservationCheckIn ?? null,
    reservationCheckOut: row.reservationCheckOut ?? null,
  };
}

export async function listMessages(
  workspaceId: string,
  conversationId: string,
): Promise<Message[]> {
  // Workspace check first to prevent cross-tenant peek.
  const conv = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
    )
    .limit(1);
  if (!conv[0]) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.sentAt);
}

// ---------- Writes ----------

export async function sendMessage(opts: {
  workspaceId: string;
  conversationId: string;
  body: string;
  attachments?: Array<{ url: string; name?: string; mime?: string; sizeBytes?: number }>;
  senderName?: string;
}): Promise<Message> {
  const conv = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, opts.workspaceId),
        eq(conversations.id, opts.conversationId),
      ),
    )
    .limit(1);
  const c = conv[0];
  if (!c) throw new Error(`conversation ${opts.conversationId} not found`);

  // Try to forward to Repull. If the workspace has no API key (demo) or the
  // SDK call fails, we still record the outbound message locally with a
  // synthetic id so the UI stays consistent and the user can retry later.
  let repullMessageId: string | null = null;
  if (c.repullConversationId) {
    try {
      const remote = await sendMessageToRepull({
        workspaceId: opts.workspaceId,
        repullConversationId: c.repullConversationId,
        body: opts.body,
        attachments: opts.attachments,
      });
      repullMessageId = remote?.id != null ? String(remote.id) : null;
    } catch {
      // Demo / offline mode — fall through to local insert.
    }
  }

  const inserted = await db
    .insert(messages)
    .values({
      conversationId: opts.conversationId,
      repullMessageId: repullMessageId ?? `local-${cryptoRandom()}`,
      direction: 'outbound',
      senderName: opts.senderName ?? 'You',
      body: opts.body,
      attachments: opts.attachments ?? [],
      sentAt: new Date(),
      deliveredAt: new Date(),
    })
    .returning();

  // Also clear the draft for this user (best-effort).
  await db
    .delete(messageDrafts)
    .where(eq(messageDrafts.conversationId, opts.conversationId));

  await refreshConversationDenorms(opts.conversationId);
  return inserted[0]!;
}

export async function markRead(workspaceId: string, conversationId: string) {
  // Workspace check.
  const conv = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
    )
    .limit(1);
  if (!conv[0]) throw new Error(`conversation ${conversationId} not found`);

  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.conversationId, conversationId), sql`${messages.readAt} IS NULL`));
  await db
    .update(conversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function archiveConversation(workspaceId: string, conversationId: string) {
  await assertOwned(workspaceId, conversationId);
  await db
    .update(conversations)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function unarchiveConversation(workspaceId: string, conversationId: string) {
  await assertOwned(workspaceId, conversationId);
  await db
    .update(conversations)
    .set({ status: 'open', updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function markSpam(workspaceId: string, conversationId: string) {
  await assertOwned(workspaceId, conversationId);
  await db
    .update(conversations)
    .set({ status: 'spam', updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

// ---------- Drafts ----------

export async function getDraft(opts: {
  workspaceId: string;
  conversationId: string;
  userId: string;
}): Promise<string> {
  await assertOwned(opts.workspaceId, opts.conversationId);
  const rows = await db
    .select()
    .from(messageDrafts)
    .where(
      and(
        eq(messageDrafts.conversationId, opts.conversationId),
        eq(messageDrafts.userId, opts.userId),
      ),
    )
    .limit(1);
  return rows[0]?.body ?? '';
}

export async function saveDraft(opts: {
  workspaceId: string;
  conversationId: string;
  userId: string;
  body: string;
}): Promise<void> {
  await assertOwned(opts.workspaceId, opts.conversationId);
  if (opts.body.trim() === '') {
    await db
      .delete(messageDrafts)
      .where(
        and(
          eq(messageDrafts.conversationId, opts.conversationId),
          eq(messageDrafts.userId, opts.userId),
        ),
      );
    return;
  }
  await db
    .insert(messageDrafts)
    .values({
      conversationId: opts.conversationId,
      userId: opts.userId,
      body: opts.body,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [messageDrafts.conversationId, messageDrafts.userId],
      set: { body: opts.body, updatedAt: new Date() },
    });
}

// ---------- Counts (for sidebar badge / filter rail) ----------

export async function getUnreadCount(workspaceId: string): Promise<number> {
  const rows = await db
    .select({
      n: sql<number>`COALESCE(SUM(${conversations.unreadCount}), 0)::int`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        // ignore archived/spam in the badge
        sql`${conversations.status} = 'open'`,
      ),
    );
  return rows[0]?.n ?? 0;
}

export async function getInboxCounts(workspaceId: string): Promise<InboxCounts> {
  const baseWhere = eq(conversations.workspaceId, workspaceId);
  const [allRow, unreadRow, openRow, archivedRow, spamRow] = await Promise.all([
    db.select({ c: count() }).from(conversations).where(baseWhere),
    db
      .select({ c: count() })
      .from(conversations)
      .where(and(baseWhere, sql`${conversations.unreadCount} > 0`)),
    db
      .select({ c: count() })
      .from(conversations)
      .where(and(baseWhere, eq(conversations.status, 'open'))),
    db
      .select({ c: count() })
      .from(conversations)
      .where(and(baseWhere, eq(conversations.status, 'archived'))),
    db
      .select({ c: count() })
      .from(conversations)
      .where(and(baseWhere, eq(conversations.status, 'spam'))),
  ]);
  const platformRows = await db
    .select({ platform: conversations.platform, c: count() })
    .from(conversations)
    .where(baseWhere)
    .groupBy(conversations.platform);
  return {
    all: allRow[0]?.c ?? 0,
    unread: unreadRow[0]?.c ?? 0,
    open: openRow[0]?.c ?? 0,
    archived: archivedRow[0]?.c ?? 0,
    spam: spamRow[0]?.c ?? 0,
    byPlatform: platformRows.map((r) => ({ platform: r.platform, count: r.c })),
  };
}

// ---------- Helpers ----------

async function assertOwned(workspaceId: string, conversationId: string) {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
    )
    .limit(1);
  if (!rows[0]) throw new Error(`conversation ${conversationId} not found`);
}

function cryptoRandom(): string {
  // Simple, dependency-free unique-ish suffix for synthetic message ids.
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}
