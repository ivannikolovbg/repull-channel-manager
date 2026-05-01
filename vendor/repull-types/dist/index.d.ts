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
export type Paths = paths;
//# sourceMappingURL=index.d.ts.map