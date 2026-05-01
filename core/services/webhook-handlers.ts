/**
 * Per-event-type webhook handlers.
 *
 * Repull events we care about for the MVP:
 *   - reservation.created / reservation.updated / reservation.cancelled
 *   - calendar.updated  → re-sync the affected listing's calendar
 *   - listing.updated   → re-sync the listing row (limited to a single listing)
 *
 * Unknown events are stored in `webhook_events` for audit but otherwise ignored.
 */

import { and, eq } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/core/db';
import { listings, webhookEvents } from '@/core/db/schema';
import { runIncrementalSync, runListingCalendarSync } from './sync';

export interface WebhookContext {
  workspaceId: string;
  signature?: string | null;
  rawBody: string;
}

export function verifyWebhookSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  if (!opts.signatureHeader) return false;
  const expected = createHmac('sha256', opts.secret).update(opts.rawBody).digest('hex');
  // Allow either the bare hex digest or the `sha256=...` style.
  const candidate = opts.signatureHeader.replace(/^sha256=/, '').trim();
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

interface RepullWebhookEnvelope {
  event?: string;
  type?: string;
  workspaceId?: string;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export async function handleRepullEvent(opts: {
  workspaceId: string;
  envelope: RepullWebhookEnvelope;
}) {
  const eventType = opts.envelope.event ?? opts.envelope.type ?? 'unknown';
  const inserted = await db
    .insert(webhookEvents)
    .values({
      workspaceId: opts.workspaceId,
      eventType,
      payload: opts.envelope as unknown as Record<string, unknown>,
    })
    .returning();
  const eventRow = inserted[0]!;

  try {
    switch (eventType) {
      case 'reservation.created':
      case 'reservation.updated':
      case 'reservation.cancelled':
        // Cheap version: re-run an incremental sync for the workspace.
        await runIncrementalSync(opts.workspaceId);
        break;

      case 'calendar.updated': {
        const data = (opts.envelope.data ?? opts.envelope.payload) as
          | { listingId?: string; propertyId?: string }
          | undefined;
        const externalListingId = String(data?.listingId ?? data?.propertyId ?? '');
        if (externalListingId) {
          const listingRows = await db
            .select()
            .from(listings)
            .where(
              and(
                eq(listings.workspaceId, opts.workspaceId),
                eq(listings.externalListingId, externalListingId),
              ),
            )
            .limit(1);
          if (listingRows[0]) {
            await runListingCalendarSync(opts.workspaceId, listingRows[0].id, 90);
          }
        }
        break;
      }

      default:
        // Audited but no further action.
        break;
    }
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, eventRow.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), error: (err as Error).message })
      .where(eq(webhookEvents.id, eventRow.id));
    throw err;
  }
}
