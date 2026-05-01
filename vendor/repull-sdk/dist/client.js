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
import { RepullError } from './errors.js';
const DEFAULT_BASE_URL = 'https://api.repull.dev';
const DEFAULT_USER_AGENT = '@repull/sdk/0.1.0-alpha.0';
const isBrowser = typeof window !== 'undefined' && typeof globalThis.document !== 'undefined';
export class Repull {
    connect;
    reservations;
    properties;
    health;
    channels;
    markets;
    listings;
    opts;
    constructor(opts = {}) {
        const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
        const dangerouslyAllowBrowser = opts.dangerouslyAllowBrowser ?? false;
        const fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
        const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
        if (isBrowser &&
            opts.apiKey &&
            !dangerouslyAllowBrowser &&
            !looksLikeRelativeUrl(baseUrl)) {
            throw new Error('[Repull] Refusing to send `apiKey` directly from a browser to ' +
                baseUrl +
                '. Either route requests through a server proxy (set `baseUrl` to a relative path like ' +
                '`/api/repull-proxy` and forward server-side) or pass `dangerouslyAllowBrowser: true`.');
        }
        this.opts = {
            apiKey: opts.apiKey,
            baseUrl,
            dangerouslyAllowBrowser,
            maxRetries: opts.maxRetries ?? 2,
            fetch: fetchImpl,
            userAgent,
        };
        this.connect = new ConnectNamespace(this);
        this.reservations = new ReservationsNamespace(this);
        this.properties = new PropertiesNamespace(this);
        this.health = new HealthNamespace(this);
        this.channels = new ChannelsNamespace(this);
        this.markets = new MarketsNamespace(this);
        this.listings = new ListingsNamespace(this);
    }
    /** @internal */
    async request(method, path, init = {}) {
        const url = buildUrl(this.opts.baseUrl, path, init.query);
        const headers = {
            Accept: 'application/json',
        };
        if (this.opts.apiKey)
            headers.Authorization = `Bearer ${this.opts.apiKey}`;
        if (init.body !== undefined)
            headers['Content-Type'] = 'application/json';
        if (!isBrowser)
            headers['User-Agent'] = this.opts.userAgent;
        const reqInit = {
            method,
            headers,
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        };
        let attempt = 0;
        while (true) {
            let res;
            try {
                res = await this.opts.fetch(url, reqInit);
            }
            catch (err) {
                if (attempt < this.opts.maxRetries) {
                    attempt++;
                    await sleep(backoffMs(attempt));
                    continue;
                }
                throw err;
            }
            if (res.ok) {
                if (res.status === 204)
                    return undefined;
                const text = await res.text();
                if (!text)
                    return undefined;
                try {
                    return JSON.parse(text);
                }
                catch {
                    return text;
                }
            }
            // Retry on 429/5xx
            if ((res.status === 429 || res.status >= 500) && attempt < this.opts.maxRetries) {
                attempt++;
                const retryAfter = Number(res.headers.get('retry-after'));
                const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
                await sleep(delay);
                continue;
            }
            const text = await res.text();
            let parsed = text;
            try {
                parsed = JSON.parse(text);
            }
            catch {
                /* keep as text */
            }
            throw RepullError.fromResponse(res.status, parsed);
        }
    }
}
class ConnectNamespace {
    client;
    airbnb;
    booking;
    plumguide;
    vrbo;
    constructor(client) {
        this.client = client;
        this.airbnb = new AirbnbConnectNamespace(client);
        this.booking = new ProviderConnectNamespace(client, 'booking');
        this.plumguide = new ProviderConnectNamespace(client, 'plumguide');
        this.vrbo = new ProviderConnectNamespace(client, 'vrbo');
    }
    /** GET /v1/connect — list every connection on this workspace. */
    list() {
        return this.client.request('GET', '/v1/connect');
    }
    /**
     * POST /v1/connect — mint a multi-channel picker session.
     *
     * The user is sent to a hosted picker (`session.url`) where they choose
     * one of the available channels (Airbnb OAuth, Booking.com claim, PMS
     * credentials, etc) and complete the per-pattern handoff. They land on
     * your `redirectUrl` once finished.
     *
     * Pass `allowedProviders` to scope the picker to a subset (e.g. only show
     * PMSes). Pass `state` for any opaque value you want echoed back.
     */
    createSession(opts) {
        return this.client.request('POST', '/v1/connect', {
            body: {
                redirectUrl: opts.redirectUrl,
                ...(opts.allowedProviders ? { allowed_providers: opts.allowedProviders } : {}),
                ...(opts.state ? { state: opts.state } : {}),
            },
        });
    }
    /**
     * GET /v1/connect/providers — list every channel currently wired into the
     * picker (OTA + PMS, OAuth + credentials + claim + activation patterns).
     */
    providers() {
        return this.client.request('GET', '/v1/connect/providers');
    }
    /** Generic provider creator for non-Airbnb providers (PMS keys, OAuth). */
    create(provider, body) {
        return this.client.request('POST', `/v1/connect/${encodeURIComponent(provider)}`, { body });
    }
    /** Generic provider status. */
    status(provider) {
        return this.client.request('GET', `/v1/connect/${encodeURIComponent(provider)}`);
    }
    /** Generic provider disconnect. */
    disconnect(provider) {
        return this.client.request('DELETE', `/v1/connect/${encodeURIComponent(provider)}`);
    }
}
class AirbnbConnectNamespace {
    client;
    constructor(client) {
        this.client = client;
    }
    /**
     * POST /v1/connect/airbnb — mint an OAuth Connect session.
     *
     * Returns `{ oauthUrl, sessionId, provider, expiresAt }`. Send the user
     * to `oauthUrl` (hosted at `connect.repull.dev`) and they'll bounce back
     * to `redirectUrl` after consent.
     */
    create(opts) {
        return this.client.request('POST', '/v1/connect/airbnb', {
            body: {
                redirectUrl: opts.redirectUrl,
                accessType: opts.accessType ?? 'full_access',
            },
        });
    }
    /** GET /v1/connect/airbnb — current connection status. */
    status() {
        return this.client.request('GET', '/v1/connect/airbnb');
    }
    /** DELETE /v1/connect/airbnb — disconnect Airbnb. */
    disconnect() {
        return this.client.request('DELETE', '/v1/connect/airbnb');
    }
}
class ProviderConnectNamespace {
    client;
    provider;
    constructor(client, provider) {
        this.client = client;
        this.provider = provider;
    }
    status() {
        return this.client.request('GET', `/v1/connect/${this.provider}`);
    }
    create(body) {
        return this.client.request('POST', `/v1/connect/${this.provider}`, { body });
    }
    disconnect() {
        return this.client.request('DELETE', `/v1/connect/${this.provider}`);
    }
}
class ReservationsNamespace {
    client;
    constructor(client) {
        this.client = client;
    }
    /** GET /v1/reservations — paginated list. */
    list(query = {}) {
        return this.client.request('GET', '/v1/reservations', { query });
    }
    /** GET /v1/reservations/{id}. */
    get(id) {
        return this.client.request('GET', `/v1/reservations/${encodeURIComponent(String(id))}`);
    }
}
class PropertiesNamespace {
    client;
    constructor(client) {
        this.client = client;
    }
    /** GET /v1/properties — paginated list. */
    list(query = {}) {
        return this.client.request('GET', '/v1/properties', { query });
    }
    /** GET /v1/properties/{id}. */
    get(id) {
        return this.client.request('GET', `/v1/properties/${encodeURIComponent(String(id))}`);
    }
}
class HealthNamespace {
    client;
    constructor(client) {
        this.client = client;
    }
    /** GET /v1/health — service heartbeat. */
    check() {
        return this.client.request('GET', '/v1/health');
    }
}
class ChannelsNamespace {
    client;
    airbnb;
    constructor(client) {
        this.client = client;
        this.airbnb = new AirbnbChannelNamespace(client);
    }
}
class AirbnbChannelNamespace {
    listings;
    constructor(client) {
        this.listings = new AirbnbListingsNamespace(client);
    }
}
class AirbnbListingsNamespace {
    client;
    constructor(client) {
        this.client = client;
    }
    /** GET /v1/channels/airbnb/listings — read-only listing index with `connections` info. */
    list(query = {}) {
        return this.client.request('GET', '/v1/channels/airbnb/listings', { query });
    }
    /** GET /v1/channels/airbnb/listings/{id}. */
    get(id) {
        return this.client.request('GET', `/v1/channels/airbnb/listings/${encodeURIComponent(String(id))}`);
    }
}
/**
 * Atlas market intelligence — every market the workspace operates in plus
 * KPIs (own ADR vs market ADR, occupancy, ratings, share). Backed by Atlas,
 * Vanio's market-intelligence fleet of 660 live workers.
 */
class MarketsNamespace {
    client;
    constructor(client) {
        this.client = client;
    }
    /**
     * GET /v1/markets — overview of every market the customer has listings
     * in, plus discovery list of nearby Atlas-tracked markets.
     *
     * Response is intentionally typed loosely (`unknown`) until the upstream
     * shape stabilises — sandbox + live keys may return slightly different
     * field sets while the endpoint is in beta.
     */
    list() {
        return this.client.request('GET', '/v1/markets');
    }
}
/**
 * Atlas pricing recommendations + apply/decline action. Recommendations
 * are pre-computed by the model and stored in `pricing_recommendations`;
 * this surface reads them and writes back the user's response.
 */
class ListingsNamespace {
    pricing;
    constructor(client) {
        this.pricing = new ListingsPricingNamespace(client);
    }
}
class ListingsPricingNamespace {
    client;
    constructor(client) {
        this.client = client;
    }
    /**
     * GET /v1/listings/{id}/pricing — recommendations + factors for a
     * listing's calendar window.
     */
    get(listingId, query = {}) {
        return this.client.request('GET', `/v1/listings/${encodeURIComponent(String(listingId))}/pricing`, { query });
    }
    /**
     * Convenience alias matching the marketing copy
     * (`repull.listings.pricing.recommendations(id)`).
     */
    recommendations(listingId, query = {}) {
        return this.get(listingId, query);
    }
    /**
     * POST /v1/listings/{id}/pricing — apply or decline pending
     * recommendations for one or more dates. Apply syncs the new price to
     * the listing's calendar (and to the OTAs via fan-out).
     */
    action(listingId, body) {
        return this.client.request('POST', `/v1/listings/${encodeURIComponent(String(listingId))}/pricing`, { body });
    }
}
// helpers
function buildUrl(baseUrl, path, query) {
    const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const trimmedPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${trimmedBase}${trimmedPath}`;
    if (query && Object.keys(query).length > 0) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(query)) {
            if (v === undefined || v === null)
                continue;
            params.append(k, String(v));
        }
        const qs = params.toString();
        if (qs)
            url += `?${qs}`;
    }
    return url;
}
function looksLikeRelativeUrl(url) {
    return url.startsWith('/') && !url.startsWith('//');
}
function backoffMs(attempt) {
    // 250ms, 750ms, 2.25s, ...  (exponential with jitter)
    const base = 250 * Math.pow(3, attempt - 1);
    const jitter = Math.random() * base * 0.25;
    return Math.min(base + jitter, 5000);
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=client.js.map