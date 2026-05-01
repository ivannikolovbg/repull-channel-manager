/**
 * Messaging webhook handler — invoked from the central
 * `core/services/webhook-handlers.ts` dispatcher when an event with prefix
 * `conversation.` or `message.` lands.
 *
 * Events we care about:
 *   - conversation.created                   → upsert conversation row
 *   - conversation.updated                   → update denorms
 *   - conversation.message.received          → append inbound message + bump unread
 *   - conversation.message.sent              → append outbound message (mirrors)
 *   - message.received / message.sent        → channel-specific aliases
 *
 * The HMAC signature check happens upstream in `app/api/webhooks/repull/route.ts`.
 * We only see verified events here.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/core/db';
import { conversations, guests, listings, messages, reservations } from '@/core/db/schema';
import { refreshConversationDenorms } from './repull-sync';

export interface MessagingWebhookPayload {
  conversationId?: string;
  conversation?: {
    id?: string;
    platform?: string;
    guestName?: string;
    guestEmail?: string;
    listingId?: string;
    reservationId?: string;
  };
  message?: {
    id?: string;
    body?: string;
    senderType?: string;
    senderName?: string;
    senderAvatarUrl?: string;
    sentAt?: string;
    attachments?: Array<{ url?: string; name?: string; mime?: string }>;
  };
}

export async function handleMessagingWebhook(opts: {
  workspaceId: string;
  eventType: string;
  payload: MessagingWebhookPayload;
}): Promise<void> {
  const { workspaceId, eventType, payload } = opts;
  const repullConversationId = String(
    payload.conversationId ?? payload.conversation?.id ?? payload.message?.id ?? '',
  );
  if (!repullConversationId) return;

  // Best-effort upsert of the conversation shell.
  const conv = await ensureConversation(workspaceId, repullConversationId, payload);

  if (eventType === 'conversation.created' || eventType === 'conversation.updated') {
    await refreshConversationDenorms(conv.id);
    return;
  }

  if (
    eventType === 'conversation.message.received' ||
    eventType === 'message.received' ||
    eventType === 'conversation.message.sent' ||
    eventType === 'message.sent'
  ) {
    const m = payload.message;
    if (!m?.body) return;
    const direction =
      eventType.endsWith('.sent') ||
      (m.senderType ?? '').toLowerCase() === 'host' ||
      (m.senderType ?? '').toLowerCase() === 'agent'
        ? 'outbound'
        : 'inbound';
    const sentAt = m.sentAt ? new Date(m.sentAt) : new Date();
    const attachments = (m.attachments ?? [])
      .filter((a) => !!a?.url)
      .map((a) => ({ url: String(a.url), name: a.name, mime: a.mime }));

    await db
      .insert(messages)
      .values({
        conversationId: conv.id,
        repullMessageId: m.id ? String(m.id) : `webhook-${Date.now()}`,
        direction,
        senderName: m.senderName ?? null,
        senderAvatarUrl: m.senderAvatarUrl ?? null,
        body: m.body,
        attachments,
        sentAt,
        deliveredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [messages.conversationId, messages.repullMessageId],
        set: { body: m.body },
      });

    if (direction === 'inbound') {
      await db
        .update(conversations)
        .set({
          unreadCount: sql`${conversations.unreadCount} + 1`,
          lastMessageAt: sentAt,
          lastMessagePreview: m.body.slice(0, 200),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conv.id));
    } else {
      await refreshConversationDenorms(conv.id);
    }
  }
}

async function ensureConversation(
  workspaceId: string,
  repullConversationId: string,
  payload: MessagingWebhookPayload,
) {
  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.repullConversationId, repullConversationId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  let listingId: string | null = null;
  let reservationId: string | null = null;
  let guestId: string | null = null;
  if (payload.conversation?.listingId) {
    const lrows = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.workspaceId, workspaceId),
          eq(listings.externalListingId, payload.conversation.listingId),
        ),
      )
      .limit(1);
    listingId = lrows[0]?.id ?? null;
  }
  if (payload.conversation?.reservationId) {
    const rrows = await db
      .select({ id: reservations.id, guestId: reservations.guestId })
      .from(reservations)
      .where(
        and(
          eq(reservations.workspaceId, workspaceId),
          eq(reservations.externalReservationId, payload.conversation.reservationId),
        ),
      )
      .limit(1);
    reservationId = rrows[0]?.id ?? null;
    guestId = rrows[0]?.guestId ?? null;
  }
  if (!guestId && (payload.conversation?.guestName || payload.conversation?.guestEmail)) {
    const inserted = await db
      .insert(guests)
      .values({
        workspaceId,
        externalGuestId: payload.conversation.guestEmail ?? null,
        name: payload.conversation.guestName ?? null,
        email: payload.conversation.guestEmail ?? null,
        raw: { source: 'messaging-webhook' },
      })
      .returning();
    guestId = inserted[0]?.id ?? null;
  }

  const inserted = await db
    .insert(conversations)
    .values({
      workspaceId,
      repullConversationId,
      platform: (payload.conversation?.platform ?? 'other').toLowerCase(),
      guestId,
      listingId,
      reservationId,
      status: 'open',
      unreadCount: 0,
      raw: payload as unknown as Record<string, unknown>,
    })
    .returning();
  return inserted[0]!;
}
