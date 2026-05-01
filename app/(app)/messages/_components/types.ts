/**
 * Shared types for the messaging UI. The server-side `messaging.service.ts`
 * exports `InboxRow` / `InboxCounts`; we re-export them here so client
 * components can import from a single, type-only entry point and not pull the
 * service (and its DB driver) into the browser bundle.
 */

import type {
  InboxCounts,
  InboxRow,
} from '@/core/services/messaging/messaging.service';
import type { Conversation, Message } from '@/core/db/schema';

export type { InboxRow, InboxCounts, Conversation, Message };

export interface ConversationDetail {
  conversation: Conversation;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  listingName: string | null;
  listingCity: string | null;
  reservationCode: string | null;
  reservationCheckIn: string | null;
  reservationCheckOut: string | null;
}

export interface SuggestionsResponse {
  suggestions: string[];
  provider: 'vanio' | 'openai' | 'anthropic' | 'stub';
  modelUsed?: string;
}

export const PLATFORM_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking.com',
  vrbo: 'VRBO',
  direct: 'Direct',
  other: 'Other',
};

/** Tailwind colour token per platform — keeps platform pills consistent. */
export const PLATFORM_TONE: Record<string, string> = {
  airbnb: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
  booking: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  vrbo: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  direct: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  other: 'text-white/70 bg-white/[0.04] border-white/[0.08]',
};
