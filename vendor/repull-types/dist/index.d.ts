import type { components, paths } from './openapi.js';
export type { components, paths } from './openapi.js';
/** Convenience aliases over the generated `components.schemas`. */
export type Property = components['schemas']['Property'];
export type Reservation = components['schemas']['Reservation'];
export type Guest = components['schemas']['Guest'];
export type CalendarDay = components['schemas']['CalendarDay'];
export type Conversation = components['schemas']['Conversation'];
export type Message = components['schemas']['Message'];
export type Connection = components['schemas']['Connection'];
export type WebhookSubscription = components['schemas']['WebhookSubscription'];
export type AIOperation = components['schemas']['AIOperation'];
export type RepullErrorPayload = components['schemas']['Error'];
export type PaginatedResponse = components['schemas']['PaginatedResponse'];
/** Hand-typed (the OpenAPI shape was loose). */
export interface ConnectSession {
    oauthUrl: string;
    sessionId: string;
    provider: string;
    expiresAt: string;
}
/**
 * Multi-channel picker session, returned by `POST /v1/connect` (no provider).
 *
 * `url` points at the hosted picker on connect.repull.dev — the user picks
 * a channel, completes the per-pattern handoff, then bounces back to the
 * `redirectUrl` you supplied.
 */
export interface ConnectPickerSession {
    sessionId: string;
    url: string;
    expiresAt: string;
    /** Echo of the opaque `state` you passed in, or null. */
    state: string | null;
}
export type ConnectPattern = 'oauth' | 'credentials' | 'claim' | 'activation';
export type ConnectChannelCategory = 'ota' | 'pms';
export type ConnectChannelStatus = 'live' | 'beta' | 'coming_soon';
/** A single channel as returned by `GET /v1/connect/providers`. */
export interface ConnectProvider {
    id: string;
    displayName: string;
    category: ConnectChannelCategory;
    connectPattern: ConnectPattern;
    status: ConnectChannelStatus;
    logoUrl: string | null;
    description: string | null;
    docsUrl: string | null;
    aliases?: string[];
}
/**
 * Public-facing host metadata returned alongside a connection status.
 *
 * Currently populated for Airbnb only — the host's first name + Airbnb avatar
 * pulled from the partner-API host record. Email is intentionally NOT
 * included: Airbnb does not expose host email through their partner API,
 * and the customer's own login email is what they already know.
 *
 * For non-Airbnb providers `host` is `null` until per-provider enrichment
 * lands.
 */
export interface ConnectHost {
    /** Short display name (e.g. Airbnb first name). */
    displayName: string | null;
    /** Preferred long-form name; falls back to displayName when no preferred form is set. */
    displayNameLong: string | null;
    /** Profile picture URL (small). */
    avatarUrl: string | null;
    /** Profile picture URL (large). */
    avatarUrlLarge: string | null;
    /** Per-provider activation/onboarding status. */
    activationStatus: string | null;
}
export interface ConnectStatus {
    connected: boolean;
    provider: string;
    /** Repull-side connection ID. Stable across token refreshes. Present when `connected` is true. */
    id?: number;
    externalAccountId?: string | null;
    status?: 'active' | 'inactive' | 'error';
    createdAt?: string;
    /**
     * Host metadata for the linked account. Populated for Airbnb when the
     * host row exists; null for other providers. Use this to render an
     * account-level confirmation card (avatar + name) instead of just an ID.
     */
    host?: ConnectHost | null;
    [key: string]: unknown;
}
export type AirbnbAccessType = 'read_only' | 'full_access';
export type RepullProvider = 'airbnb' | 'booking' | 'plumguide' | 'vrbo' | 'hostaway' | 'guesty' | 'lodgify' | 'hostfully' | (string & {});
/** Standard paginated list response used across most list endpoints. */
export interface ListResponse<T> {
    data: T[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
}
/** Health endpoint response. */
export interface HealthResponse {
    status: 'ok' | 'degraded' | string;
    service: string;
    version: string;
    timestamp: string;
}
/**
 * One market (city) the customer operates in, with KPIs derived from the
 * customer's own listings and Atlas's competitor index.
 *
 * `priceDiffPct` is positive when the customer's ADR is above the market
 * average — i.e. they're priced higher than competitors.
 */
export interface MarketSummary {
    city: string;
    myListings: number;
    totalListings: number;
    marketSharePct: number | null;
    myAvgAdr: number | null;
    marketAvgAdr: number | null;
    priceDiffPct: number | null;
    myAvgRating: number | null;
    marketAvgRating: number | null;
    myOccupancyPct: number | null;
    marketOccupancyPct: number | null;
    propertyTypes: number;
}
/** Customer listing pin for the markets map view (lat/lng + ADR). */
export interface MarketListingPin {
    id: number;
    name: string | null;
    city: string | null;
    lat: number;
    lng: number;
    thumbnail: string | null;
    todayPrice: number | null;
    blocked: boolean;
    bookedNights: number;
    availableNights: number;
    type: 'mine';
}
/** A market the customer doesn't yet operate in but Atlas has comp coverage for. */
export interface BrowseMarket {
    city: string;
    listings: number;
}
export interface MarketsResponse {
    markets: MarketSummary[];
    totals: {
        myListings: number;
        markets: number;
        totalCompetitors?: number;
    };
    myListings?: MarketListingPin[];
    browseMarkets?: BrowseMarket[];
}
export type PricingRecommendationStatus = 'pending' | 'applied' | 'declined' | 'expired' | string;
/**
 * One day's pricing recommendation. `factors` is a free-form structure the
 * model emits (e.g. `{ event: 'F1 Grand Prix', demand: 'high' }`) — render
 * its keys as chips.
 */
export interface PricingRecommendation {
    date: string;
    currentPrice: number | null;
    recommendedPrice: number;
    minPrice: number | null;
    maxPrice: number | null;
    currency: string | null;
    confidence: number;
    bookingProbability: number | null;
    expectedRevenue: number | null;
    factors: Record<string, unknown> | null;
    status: PricingRecommendationStatus;
    modelVersion: string | null;
    generatedAt: string | null;
}
export interface PricingResponse {
    recommendations: PricingRecommendation[];
    listing?: {
        aiBasePrice?: number | null;
        aiBasePriceFactors?: Record<string, unknown> | null;
        aiQualityTier?: string | null;
        aiSegment?: string | null;
        currency?: string | null;
    } | null;
    compSummary?: {
        compCount: number;
        compAvg: number | null;
        compMin: number | null;
        compMax: number | null;
    } | null;
    [key: string]: unknown;
}
export type Paths = paths;
//# sourceMappingURL=index.d.ts.map