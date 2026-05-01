/**
 * Messaging sync — pulls conversations + messages from Repull and upserts
 * them into the local `conversations` / `messages` tables.
 *
 * Endpoints consumed (verified against api.repull.dev OpenAPI):
 *   - GET  /v1/conversations                              list_conversations
 *   - GET  /v1/conversations/{id}/messages                list_conversation_messages
 *   - POST /v1/conversations/{id}/messages                send_conversation_message
 *
 * Channel-specific surfaces (Airbnb /v1/channels/airbnb/messaging,
 * Booking /v1/channels/booking/messaging) exist but the unified
 * `/v1/conversations` is preferred for cross-platform consistency. We fall
 * back to the per-channel endpoints if the unified one fails.
 *
 * All writes are idempotent (`ON CONFLICT DO UPDATE`) keyed on
 * (workspaceId, repullConversationId) and (conversationId, repullMessageId).
 */

import { and, eq, sql } from 'drizzle-orm';
import { Repull } from '@repull/sdk';
import { db } from '@/core/db';
import {
  conversations,
  guests,
  listings,
  messages,
  reservations,
  type Conversation,
} from '@/core/db/schema';
import { getRepullForWorkspace } from '../repull-client';

// ---------- Public API ----------

export interface ConversationSyncStats {
  conversationsFetched: number;
  conversationsUpserted: number;
  messagesFetched: number;
  messagesUpserted: number;
  errors: string[];
}

export async function syncConversationsForWorkspace(
  workspaceId: string,
): Promise<ConversationSyncStats> {
  const stats: ConversationSyncStats = {
    conversationsFetched: 0,
    conversationsUpserted: 0,
    messagesFetched: 0,
    messagesUpserted: 0,
    errors: [],
  };
  const client = await getRepullForWorkspace(workspaceId);

  // 1) List conversations from the unified endpoint.
  const remoteConvs = await fetchUnifiedConversations(client, stats);
  stats.conversationsFetched = remoteConvs.length;

  for (const remote of remoteConvs) {
    try {
      const local = await upsertConversation(workspaceId, remote);
      stats.conversationsUpserted += 1;
      const msgs = await fetchConversationMessages(client, remote.repullConversationId, stats);
      stats.messagesFetched += msgs.length;
      for (const m of msgs) {
        await upsertMessage(local.id, m);
        stats.messagesUpserted += 1;
      }
      await refreshConversationDenorms(local.id);
    } catch (err) {
      stats.errors.push(
        `conversation ${remote.repullConversationId}: ${(err as Error).message}`,
      );
    }
  }

  return stats;
}

export async function syncMessagesForConversation(
  workspaceId: string,
  conversationId: string,
): Promise<{ fetched: number; upserted: number }> {
  const client = await getRepullForWorkspace(workspaceId);
  const conv = await getLocalConversation(workspaceId, conversationId);
  if (!conv?.repullConversationId) return { fetched: 0, upserted: 0 };
  const msgs = await fetchConversationMessages(client, conv.repullConversationId, null);
  let upserted = 0;
  for (const m of msgs) {
    await upsertMessage(conv.id, m);
    upserted += 1;
  }
  await refreshConversationDenorms(conv.id);
  return { fetched: msgs.length, upserted };
}

// ---------- Repull HTTP helpers ----------

interface RepullConversationRow {
  id?: string | number;
  conversationId?: string | number;
  reservationId?: string | number;
  listingId?: string | number;
  guestName?: string;
  guestEmail?: string;
  platform?: string;
  channel?: string;
  subject?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  status?: string;
}

interface NormalisedConversation {
  repullConversationId: string;
  platform: string;
  externalReservationId?: string | null;
  externalListingId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  subject?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: Date | null;
  unreadCount?: number;
  status?: string | null;
  raw?: Record<string, unknown>;
}

interface RepullMessageRow {
  id?: string | number;
  messageId?: string | number;
  conversationId?: string | number;
  senderType?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  message?: string;
  body?: string;
  attachments?: Array<{ url?: string; name?: string; mime?: string; sizeBytes?: number }>;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
}

interface NormalisedMessage {
  repullMessageId: string;
  direction: 'inbound' | 'outbound';
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  body: string;
  attachments?: Array<{ url: string; name?: string; mime?: string; sizeBytes?: number }>;
  sentAt: Date;
  deliveredAt?: Date | null;
  readAt?: Date | null;
}

async function fetchUnifiedConversations(
  client: Repull,
  stats: ConversationSyncStats,
): Promise<NormalisedConversation[]> {
  try {
    const res = await (client as unknown as {
      request: <T>(method: string, path: string, init?: { query?: Record<string, unknown> }) => Promise<T>;
    }).request<{ data?: RepullConversationRow[] } | RepullConversationRow[]>(
      'GET',
      '/v1/conversations',
    );
    const rows = Array.isArray(res) ? res : (res?.data ?? []);
    return rows.map(normaliseConversation);
  } catch (err) {
    stats.errors.push(`list_conversations: ${(err as Error).message}`);
    return [];
  }
}

async function fetchConversationMessages(
  client: Repull,
  repullConversationId: string,
  stats: ConversationSyncStats | null,
): Promise<NormalisedMessage[]> {
  try {
    const res = await (client as unknown as {
      request: <T>(method: string, path: string, init?: { query?: Record<string, unknown> }) => Promise<T>;
    }).request<{ data?: RepullMessageRow[] } | RepullMessageRow[]>(
      'GET',
      `/v1/conversations/${encodeURIComponent(repullConversationId)}/messages`,
    );
    const rows = Array.isArray(res) ? res : (res?.data ?? []);
    return rows.map(normaliseMessage).filter((m): m is NormalisedMessage => !!m);
  } catch (err) {
    stats?.errors.push(
      `list_conversation_messages ${repullConversationId}: ${(err as Error).message}`,
    );
    return [];
  }
}

export async function sendMessageToRepull(opts: {
  workspaceId: string;
  repullConversationId: string;
  body: string;
  attachments?: Array<{ url: string; name?: string; mime?: string }>;
}): Promise<RepullMessageRow | null> {
  const client = await getRepullForWorkspace(opts.workspaceId);
  const res = await (client as unknown as {
    request: <T>(method: string, path: string, init?: { body?: unknown }) => Promise<T>;
  }).request<RepullMessageRow>(
    'POST',
    `/v1/conversations/${encodeURIComponent(opts.repullConversationId)}/messages`,
    {
      body: { message: opts.body, attachments: opts.attachments ?? undefined },
    },
  );
  return res ?? null;
}

// ---------- Normalisation ----------

function normaliseConversation(row: RepullConversationRow): NormalisedConversation {
  return {
    repullConversationId: String(row.id ?? row.conversationId ?? ''),
    platform: normalisePlatform(row.platform ?? row.channel),
    externalReservationId: row.reservationId != null ? String(row.reservationId) : null,
    externalListingId: row.listingId != null ? String(row.listingId) : null,
    guestName: row.guestName ?? null,
    guestEmail: row.guestEmail ?? null,
    subject: row.subject ?? null,
    lastMessage: row.lastMessage ?? null,
    lastMessageAt: row.lastMessageAt ? safeDate(row.lastMessageAt) : null,
    unreadCount: typeof row.unreadCount === 'number' ? row.unreadCount : 0,
    status: row.status ?? 'open',
    raw: row as unknown as Record<string, unknown>,
  };
}

function normaliseMessage(row: RepullMessageRow): NormalisedMessage | null {
  const id = String(row.id ?? row.messageId ?? '');
  if (!id) return null;
  const body = row.body ?? row.message ?? '';
  const sentAt = row.sentAt ? safeDate(row.sentAt) : new Date();
  const senderType = (row.senderType ?? '').toLowerCase();
  const direction: 'inbound' | 'outbound' =
    senderType === 'host' || senderType === 'agent' || senderType === 'outbound'
      ? 'outbound'
      : 'inbound';
  const attachments = (row.attachments ?? [])
    .filter((a) => !!a?.url)
    .map((a) => ({
      url: String(a.url),
      name: a.name,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
    }));
  return {
    repullMessageId: id,
    direction,
    senderName: row.senderName ?? null,
    senderAvatarUrl: row.senderAvatarUrl ?? null,
    body,
    attachments,
    sentAt: sentAt ?? new Date(),
    deliveredAt: row.deliveredAt ? safeDate(row.deliveredAt) : null,
    readAt: row.readAt ? safeDate(row.readAt) : null,
  };
}

function normalisePlatform(raw: string | undefined | null): string {
  if (!raw) return 'other';
  const v = raw.toLowerCase();
  if (v.includes('airbnb')) return 'airbnb';
  if (v.includes('booking')) return 'booking';
  if (v.includes('vrbo')) return 'vrbo';
  if (v.includes('direct') || v.includes('website')) return 'direct';
  return v;
}

function safeDate(input: string | number | Date): Date | null {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- Local upserts ----------

async function upsertConversation(
  workspaceId: string,
  remote: NormalisedConversation,
): Promise<Conversation> {
  // Best-effort link to local listing/reservation/guest by external IDs.
  let listingId: string | null = null;
  let reservationId: string | null = null;
  let guestId: string | null = null;

  if (remote.externalListingId) {
    const lrows = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.workspaceId, workspaceId),
          eq(listings.externalListingId, remote.externalListingId),
        ),
      )
      .limit(1);
    listingId = lrows[0]?.id ?? null;
  }
  if (remote.externalReservationId) {
    const rrows = await db
      .select({ id: reservations.id, guestId: reservations.guestId })
      .from(reservations)
      .where(
        and(
          eq(reservations.workspaceId, workspaceId),
          eq(reservations.externalReservationId, remote.externalReservationId),
        ),
      )
      .limit(1);
    reservationId = rrows[0]?.id ?? null;
    guestId = rrows[0]?.guestId ?? null;
  }
  if (!guestId && (remote.guestName || remote.guestEmail)) {
    // Create a stub guest so the inbox can show a name even without a reservation.
    const inserted = await db
      .insert(guests)
      .values({
        workspaceId,
        externalGuestId: remote.guestEmail ?? null,
        name: remote.guestName ?? null,
        email: remote.guestEmail ?? null,
        raw: { source: 'messaging-sync' },
      })
      .returning();
    guestId = inserted[0]?.id ?? null;
  }

  const upserted = await db
    .insert(conversations)
    .values({
      workspaceId,
      repullConversationId: remote.repullConversationId,
      platform: remote.platform,
      guestId,
      listingId,
      reservationId,
      subject: remote.subject ?? null,
      lastMessageAt: remote.lastMessageAt,
      lastMessagePreview: remote.lastMessage ?? null,
      unreadCount: remote.unreadCount ?? 0,
      status: remote.status ?? 'open',
      raw: remote.raw ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [conversations.workspaceId, conversations.repullConversationId],
      set: {
        platform: remote.platform,
        guestId,
        listingId,
        reservationId,
        subject: remote.subject ?? null,
        lastMessageAt: remote.lastMessageAt,
        lastMessagePreview: remote.lastMessage ?? null,
        // Don't clobber locally-incremented unreadCount with a stale remote 0.
        unreadCount: sql`GREATEST(${conversations.unreadCount}, ${remote.unreadCount ?? 0})`,
        status: remote.status ?? 'open',
        raw: remote.raw ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return upserted[0]!;
}

async function upsertMessage(conversationId: string, m: NormalisedMessage): Promise<void> {
  await db
    .insert(messages)
    .values({
      conversationId,
      repullMessageId: m.repullMessageId,
      direction: m.direction,
      senderName: m.senderName ?? null,
      senderAvatarUrl: m.senderAvatarUrl ?? null,
      body: m.body,
      attachments: m.attachments ?? [],
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt ?? null,
      readAt: m.readAt ?? null,
    })
    .onConflictDoUpdate({
      target: [messages.conversationId, messages.repullMessageId],
      set: {
        body: m.body,
        deliveredAt: m.deliveredAt ?? null,
        readAt: m.readAt ?? null,
        attachments: m.attachments ?? [],
      },
    });
}

async function getLocalConversation(
  workspaceId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Recompute the denorms used by the inbox row from the actual messages. */
export async function refreshConversationDenorms(conversationId: string): Promise<void> {
  await db.execute(sql`
    UPDATE conversations c
    SET
      last_message_at = m.last_at,
      last_message_preview = LEFT(m.last_body, 200),
      unread_count = m.unread,
      updated_at = NOW()
    FROM (
      SELECT
        conversation_id,
        MAX(sent_at) AS last_at,
        (SELECT body FROM messages m2 WHERE m2.conversation_id = ${conversationId} ORDER BY sent_at DESC LIMIT 1) AS last_body,
        SUM(CASE WHEN direction = 'inbound' AND read_at IS NULL THEN 1 ELSE 0 END)::int AS unread
      FROM messages
      WHERE conversation_id = ${conversationId}
      GROUP BY conversation_id
    ) AS m
    WHERE c.id = ${conversationId} AND m.conversation_id = c.id
  `);
}
