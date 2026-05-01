/**
 * @repull/sdk — official TypeScript SDK for api.repull.dev.
 *
 * Hand-written ergonomic facade over the documented REST surface.
 * v0.1.0-alpha — covers Connect (Airbnb OAuth flagship), Reservations,
 * Properties, Health, and Airbnb listings (read).
 *
 * Browser-safe behind a server proxy. Do NOT pass `apiKey` directly from
 * a browser bundle without `dangerouslyAllowBrowser: true`. Mirror the
 * pattern used by the OpenAI / Anthropic SDKs.
 */
export { Repull } from './client.js';
export type { RepullOptions, FetchLike } from './client.js';
export { RepullError, RepullAuthError, RepullRateLimitError, RepullValidationError } from './errors.js';
export type { Property, Reservation, Guest, Conversation, Message, Connection, WebhookSubscription, AIOperation, ConnectSession, ConnectStatus, AirbnbAccessType, ListResponse, HealthResponse, } from '@repull/types';
//# sourceMappingURL=index.d.ts.map