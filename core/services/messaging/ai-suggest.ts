/**
 * AI-suggested replies — proxies to Vanio AI when `VANIO_AI_API_KEY` is set,
 * otherwise falls back to OpenAI / Anthropic if those keys are present, and
 * finally to a deterministic stub so the feature is always demo-able.
 *
 * The Vanio AI public reply endpoint is documented at https://api.vanio.ai
 * (POST /api/public/ai/reply-suggestions). The shape we send/receive here is
 * intentionally narrow so swapping providers stays easy.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  conversations,
  guests,
  listings,
  messages,
  reservations,
} from '@/core/db/schema';

export interface SuggestionResult {
  suggestions: string[];
  provider: 'vanio' | 'openai' | 'anthropic' | 'stub';
  modelUsed?: string;
}

/**
 * Top-level entrypoint. Builds context from the conversation + linked entities
 * and asks the configured provider for 3 candidate replies.
 */
export async function suggestReplies(opts: {
  workspaceId: string;
  conversationId: string;
}): Promise<SuggestionResult> {
  const ctx = await buildContext(opts.workspaceId, opts.conversationId);
  if (!ctx) return { suggestions: [], provider: 'stub' };

  const provider =
    process.env.VANIO_AI_API_KEY
      ? 'vanio'
      : process.env.OPENAI_API_KEY
        ? 'openai'
        : process.env.ANTHROPIC_API_KEY
          ? 'anthropic'
          : 'stub';

  try {
    if (provider === 'vanio') return await callVanio(ctx);
    if (provider === 'openai') return await callOpenAI(ctx);
    if (provider === 'anthropic') return await callAnthropic(ctx);
  } catch (err) {
    // Soft-fail to stub so the UI always renders something.
    console.error('[ai-suggest] provider failed, falling back to stub:', err);
  }
  return { suggestions: stubSuggestions(ctx), provider: 'stub' };
}

// ---------- Context ----------

interface AiContext {
  guestName: string | null;
  listingName: string | null;
  listingCity: string | null;
  reservationCode: string | null;
  checkIn: string | null;
  checkOut: string | null;
  platform: string;
  recentMessages: Array<{ direction: 'inbound' | 'outbound'; senderName: string | null; body: string }>;
  lastInbound: string | null;
}

async function buildContext(
  workspaceId: string,
  conversationId: string,
): Promise<AiContext | null> {
  const rows = await db
    .select({
      c: conversations,
      guestName: guests.name,
      listingName: listings.name,
      listingCity: listings.city,
      reservationCode: reservations.confirmationCode,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(conversations)
    .leftJoin(guests, eq(guests.id, conversations.guestId))
    .leftJoin(listings, eq(listings.id, conversations.listingId))
    .leftJoin(reservations, eq(reservations.id, conversations.reservationId))
    .where(
      and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
    )
    .limit(1);
  if (!rows[0]) return null;
  const row = rows[0];

  const msgRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.sentAt);
  const recent = msgRows.slice(-12);
  const lastInbound = [...recent].reverse().find((m) => m.direction === 'inbound');

  return {
    guestName: row.guestName,
    listingName: row.listingName,
    listingCity: row.listingCity,
    reservationCode: row.reservationCode,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    platform: row.c.platform,
    recentMessages: recent.map((m) => ({
      direction: m.direction as 'inbound' | 'outbound',
      senderName: m.senderName,
      body: m.body,
    })),
    lastInbound: lastInbound?.body ?? null,
  };
}

// ---------- Providers ----------

async function callVanio(ctx: AiContext): Promise<SuggestionResult> {
  const url =
    process.env.VANIO_AI_BASE_URL ?? 'https://api.vanio.ai/api/public/ai/reply-suggestions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.VANIO_AI_API_KEY}`,
    },
    body: JSON.stringify({
      conversation: ctx.recentMessages,
      listing: { name: ctx.listingName, city: ctx.listingCity },
      reservation: {
        code: ctx.reservationCode,
        checkIn: ctx.checkIn,
        checkOut: ctx.checkOut,
      },
      guest: { name: ctx.guestName },
      platform: ctx.platform,
      n: 3,
    }),
  });
  if (!res.ok) throw new Error(`vanio ${res.status}`);
  const json = (await res.json()) as { suggestions?: string[]; model?: string };
  const suggestions = (json.suggestions ?? []).slice(0, 3).filter(Boolean);
  if (suggestions.length === 0) throw new Error('vanio returned 0 suggestions');
  return { suggestions, provider: 'vanio', modelUsed: json.model };
}

async function callOpenAI(ctx: AiContext): Promise<SuggestionResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: renderUserPrompt(ctx) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const raw = json.choices?.[0]?.message?.content ?? '{}';
  const parsed = parseSuggestionsJson(raw);
  if (parsed.length === 0) throw new Error('openai returned 0 suggestions');
  return { suggestions: parsed, provider: 'openai', modelUsed: json.model };
}

async function callAnthropic(ctx: AiContext): Promise<SuggestionResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: renderUserPrompt(ctx) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = (await res.json()) as {
    content?: Array<{ text?: string }>;
    model?: string;
  };
  const raw = (json.content ?? []).map((c) => c.text ?? '').join('\n');
  const parsed = parseSuggestionsJson(raw);
  if (parsed.length === 0) throw new Error('anthropic returned 0 suggestions');
  return { suggestions: parsed, provider: 'anthropic', modelUsed: json.model };
}

// ---------- Prompt + parsing ----------

const SYSTEM_PROMPT = `You are Vanio AI, drafting reply suggestions for a vacation-rental host writing back to a guest.
Rules:
  - Tone: warm, concise, human. No emojis, no exclamation overload.
  - Match the guest's language when possible (English if unsure).
  - Address the guest's most recent question first.
  - Keep each suggestion under 60 words.
  - Never invent specific facts (door codes, addresses, phone numbers, prices) — when needed,
    use placeholders like "<your check-in instructions>".
  - Output strictly as JSON: {"suggestions":["…","…","…"]}. Three suggestions, varying tone:
    a) friendly + practical
    b) brief + direct
    c) warm + slightly longer with a touch of context.`;

function renderUserPrompt(ctx: AiContext): string {
  const transcript = ctx.recentMessages
    .map((m) => `${m.direction === 'inbound' ? 'GUEST' : 'HOST'}: ${m.body}`)
    .join('\n');
  return [
    `Listing: ${ctx.listingName ?? '(unknown)'}${ctx.listingCity ? ` · ${ctx.listingCity}` : ''}`,
    `Guest: ${ctx.guestName ?? 'Guest'}`,
    `Reservation: ${ctx.reservationCode ?? 'n/a'}` +
      (ctx.checkIn ? ` · ${ctx.checkIn} → ${ctx.checkOut ?? '?'}` : ''),
    `Platform: ${ctx.platform}`,
    '',
    'Recent thread (oldest first):',
    transcript || '(empty thread)',
    '',
    `Last inbound: ${ctx.lastInbound ?? '(none)'}`,
    '',
    'Reply with JSON: {"suggestions":["…","…","…"]}',
  ].join('\n');
}

function parseSuggestionsJson(raw: string): string[] {
  // Models occasionally wrap JSON in markdown fences. Strip them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { suggestions?: string[] };
    return (parsed.suggestions ?? []).slice(0, 3).map((s) => s.trim()).filter(Boolean);
  } catch {
    // Last-ditch: split lines.
    return cleaned
      .split('\n')
      .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }
}

// ---------- Stub (always available) ----------

function stubSuggestions(ctx: AiContext): string[] {
  const guest = ctx.guestName?.split(' ')[0] ?? 'there';
  const listing = ctx.listingName ?? 'the place';
  return [
    `Hi ${guest} — happy to help. Can you give me a bit more detail so I can get you a quick answer?`,
    `Thanks for reaching out about ${listing}. I'll check on this and get back to you within the hour.`,
    `Hey ${guest}, great to hear from you. Let me look into this and circle back shortly with the specifics you need.`,
  ];
}
