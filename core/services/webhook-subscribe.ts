/**
 * Auto-subscribe a workspace's `/api/webhooks/repull` endpoint to all
 * reservation, listing, calendar, and connection events on first connect.
 *
 * Stripe pattern — `POST /v1/webhooks` returns the plaintext signing secret
 * exactly once. Capture it into `workspaces.repullWebhookSecret` and persist
 * the subscription id so we can rotate later.
 *
 * Idempotent: if the workspace already has a `repullWebhookId`, we return the
 * existing record without touching Repull.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { workspaces } from '@/core/db/schema';
import { getRepullForWorkspace } from './repull-client';

export const SUBSCRIBED_EVENT_PATTERNS = [
  'reservation.*',
  'listing.*',
  'calendar.*',
  'connection.*',
];

interface WebhookSubscriptionResponse {
  id: string;
  url: string;
  events: string[];
  secret?: string | null;
  secretMasked?: string | null;
  status?: string;
}

interface WebhookEventCatalog {
  domains?: Array<{ events?: Array<{ type?: string }> }>;
}

export interface SubscribeResult {
  webhookId: string;
  url: string;
  events: string[];
  secret: string | null;
  alreadyExisted: boolean;
}

/**
 * Subscribe (or no-op if already subscribed) the workspace's hosted
 * `/api/webhooks/repull` endpoint to all events we care about.
 */
export async function ensureWebhookSubscription(opts: {
  workspaceId: string;
  callbackUrl: string;
}): Promise<SubscribeResult> {
  const wsRows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, opts.workspaceId))
    .limit(1);
  const ws = wsRows[0];
  if (!ws) throw new Error(`workspace ${opts.workspaceId} not found`);

  if (ws.repullWebhookId) {
    return {
      webhookId: ws.repullWebhookId,
      url: ws.repullWebhookUrl ?? opts.callbackUrl,
      events: [],
      secret: ws.repullWebhookSecret,
      alreadyExisted: true,
    };
  }

  const client = await getRepullForWorkspace(opts.workspaceId);

  // Resolve the concrete event types. Repull's catalog can be queried, but if
  // it's unavailable we fall back to the four wildcards we care about — the
  // server side accepts wildcards per the OpenAPI examples.
  let eventTypes: string[] = SUBSCRIBED_EVENT_PATTERNS;
  try {
    const catalog = await (client as unknown as {
      request: <T>(method: string, path: string) => Promise<T>;
    }).request<WebhookEventCatalog>('GET', '/v1/webhooks/event-types');
    const concrete: string[] = [];
    for (const domain of catalog.domains ?? []) {
      for (const ev of domain.events ?? []) {
        if (
          ev.type &&
          (ev.type.startsWith('reservation.') ||
            ev.type.startsWith('listing.') ||
            ev.type.startsWith('calendar.') ||
            ev.type.startsWith('connection.'))
        ) {
          concrete.push(ev.type);
        }
      }
    }
    if (concrete.length > 0) eventTypes = concrete;
  } catch {
    // Fall back to wildcards.
  }

  const created = await (client as unknown as {
    request: <T>(method: string, path: string, init?: { body?: unknown }) => Promise<T>;
  }).request<WebhookSubscriptionResponse>('POST', '/v1/webhooks', {
    body: {
      url: opts.callbackUrl,
      events: eventTypes,
      description: 'repull-channel-manager auto-subscription',
    },
  });

  await db
    .update(workspaces)
    .set({
      repullWebhookId: created.id,
      repullWebhookSecret: created.secret ?? null,
      repullWebhookUrl: created.url ?? opts.callbackUrl,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, opts.workspaceId));

  return {
    webhookId: created.id,
    url: created.url ?? opts.callbackUrl,
    events: created.events ?? eventTypes,
    secret: created.secret ?? null,
    alreadyExisted: false,
  };
}
