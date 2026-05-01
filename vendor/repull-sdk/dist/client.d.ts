/**
 * Repull SDK client — the hand-written ergonomic facade.
 *
 *   const repull = new Repull({ apiKey });
 *   const session = await repull.connect.airbnb.create({ redirectUrl, accessType });
 *   const reservations = await repull.reservations.list();
 *   const ok = await repull.health.check();
 *
 * Browser usage requires either:
 *   - a server proxy that forwards to api.repull.dev with the key, with
 *     the SDK constructed via `new Repull({ baseUrl: '/api/repull-proxy' })`,
 *     OR
 *   - explicit `dangerouslyAllowBrowser: true` (not recommended).
 */
import type { ConnectSession, ConnectStatus, Connection, HealthResponse, ListResponse, Property, Reservation, AirbnbAccessType } from '@repull/types';
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export interface RepullOptions {
    /** Bearer token. `sk_test_*` or `sk_live_*`, or any other key the API accepts. */
    apiKey?: string;
    /** Default `https://api.repull.dev`. Pass a relative URL like `/api/repull-proxy` for a server-mediated browser setup. */
    baseUrl?: string;
    /**
     * Set to `true` to allow constructing the SDK directly in a browser with a
     * raw `apiKey`. Default is `false`. Recommended pattern is a server proxy.
     */
    dangerouslyAllowBrowser?: boolean;
    /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
    fetch?: FetchLike;
    /** Override the User-Agent header (server only). */
    userAgent?: string;
    /** Number of retries on 429/5xx. Default 2. */
    maxRetries?: number;
}
export declare class Repull {
    readonly connect: ConnectNamespace;
    readonly reservations: ReservationsNamespace;
    readonly properties: PropertiesNamespace;
    readonly health: HealthNamespace;
    readonly channels: ChannelsNamespace;
    private readonly opts;
    constructor(opts?: RepullOptions);
    /** @internal */
    request<T>(method: string, path: string, init?: {
        query?: Record<string, unknown>;
        body?: unknown;
    }): Promise<T>;
}
declare class ConnectNamespace {
    private readonly client;
    readonly airbnb: AirbnbConnectNamespace;
    readonly booking: ProviderConnectNamespace;
    readonly plumguide: ProviderConnectNamespace;
    readonly vrbo: ProviderConnectNamespace;
    constructor(client: Repull);
    /** GET /v1/connect — list every connection on this workspace. */
    list(): Promise<Connection[]>;
    /** Generic provider creator for non-Airbnb providers (PMS keys, OAuth). */
    create(provider: string, body: Record<string, unknown>): Promise<unknown>;
    /** Generic provider status. */
    status(provider: string): Promise<ConnectStatus>;
    /** Generic provider disconnect. */
    disconnect(provider: string): Promise<unknown>;
}
declare class AirbnbConnectNamespace {
    private readonly client;
    constructor(client: Repull);
    /**
     * POST /v1/connect/airbnb — mint an OAuth Connect session.
     *
     * Returns `{ oauthUrl, sessionId, provider, expiresAt }`. Send the user
     * to `oauthUrl` (hosted at `connect.repull.dev`) and they'll bounce back
     * to `redirectUrl` after consent.
     */
    create(opts: {
        redirectUrl: string;
        accessType?: AirbnbAccessType;
    }): Promise<ConnectSession>;
    /** GET /v1/connect/airbnb — current connection status. */
    status(): Promise<ConnectStatus>;
    /** DELETE /v1/connect/airbnb — disconnect Airbnb. */
    disconnect(): Promise<unknown>;
}
declare class ProviderConnectNamespace {
    private readonly client;
    private readonly provider;
    constructor(client: Repull, provider: string);
    status(): Promise<ConnectStatus>;
    create(body: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<unknown>;
}
declare class ReservationsNamespace {
    private readonly client;
    constructor(client: Repull);
    /** GET /v1/reservations — paginated list. */
    list(query?: {
        limit?: number;
        offset?: number;
        status?: string;
        platform?: string;
        from?: string;
        to?: string;
    }): Promise<ListResponse<Reservation>>;
    /** GET /v1/reservations/{id}. */
    get(id: string | number): Promise<Reservation>;
}
declare class PropertiesNamespace {
    private readonly client;
    constructor(client: Repull);
    /** GET /v1/properties — paginated list. */
    list(query?: {
        limit?: number;
        offset?: number;
    }): Promise<ListResponse<Property>>;
    /** GET /v1/properties/{id}. */
    get(id: string | number): Promise<Property>;
}
declare class HealthNamespace {
    private readonly client;
    constructor(client: Repull);
    /** GET /v1/health — service heartbeat. */
    check(): Promise<HealthResponse>;
}
declare class ChannelsNamespace {
    private readonly client;
    readonly airbnb: AirbnbChannelNamespace;
    constructor(client: Repull);
}
declare class AirbnbChannelNamespace {
    readonly listings: AirbnbListingsNamespace;
    constructor(client: Repull);
}
declare class AirbnbListingsNamespace {
    private readonly client;
    constructor(client: Repull);
    /** GET /v1/channels/airbnb/listings — read-only listing index with `connections` info. */
    list(query?: {
        limit?: number;
        offset?: number;
    }): Promise<unknown>;
    /** GET /v1/channels/airbnb/listings/{id}. */
    get(id: string | number): Promise<unknown>;
}
export {};
//# sourceMappingURL=client.d.ts.map