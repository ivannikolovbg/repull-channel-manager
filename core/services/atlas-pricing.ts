/**
 * Atlas pricing helpers.
 *
 * Wraps the workspace-scoped Repull SDK with the two pricing endpoints we
 * use from the calendar UI:
 *
 *   - `GET  /v1/listings/{id}/pricing`  — list recommendations + factors
 *                                           for a date window
 *   - `POST /v1/listings/{id}/pricing`  — apply or decline recommendations
 *
 * The listing identifier we send is the Repull-side property id stored on
 * `listings.repull_property_id`. Atlas keys recommendations off the same
 * id space.
 */

import { getRepullForWorkspace } from './repull-client';
import type { PricingRecommendation, PricingResponse } from '@repull/sdk';

export type AtlasRecommendation = PricingRecommendation;

/** Fetch every recommendation for a listing in `[from, to]`. */
export async function fetchListingPricing(opts: {
  workspaceId: string;
  repullPropertyId: string;
  from: string;
  to: string;
}): Promise<AtlasRecommendation[]> {
  const client = await getRepullForWorkspace(opts.workspaceId);
  const res = (await client.listings.pricing.recommendations(opts.repullPropertyId, {
    startDate: opts.from,
    endDate: opts.to,
  })) as PricingResponse;
  return Array.isArray(res?.recommendations) ? res.recommendations : [];
}

/**
 * Apply or decline a recommendation for one or more dates. The upstream
 * fans out to Airbnb / Booking / VRBO when applying, so this can be slow
 * (~5-30s in practice) — UI should show a spinner.
 */
export async function applyPricingAction(opts: {
  workspaceId: string;
  repullPropertyId: string;
  dates: string[];
  action: 'apply' | 'decline';
}): Promise<unknown> {
  const client = await getRepullForWorkspace(opts.workspaceId);
  return client.listings.pricing.action(opts.repullPropertyId, {
    dates: opts.dates,
    action: opts.action,
  });
}
