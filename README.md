# Repull Channel Manager

> **Status:** v0.1.0-alpha — early preview. Forkable starter, not a hosted product.

Open-source channel manager starter on top of [`@repull/sdk`](https://github.com/ivannikolovbg/repull-sdk) and [api.repull.dev](https://api.repull.dev). **Clone, deploy to Vercel, ship your own SuiteOp / Turno / Hostaway in a weekend.**

---

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ivannikolovbg/repull-channel-manager&env=DATABASE_URL,AUTH_SECRET,AUTH_URL,REPULL_API_BASE_URL,WEBHOOK_SIGNING_SECRET&envDescription=Postgres%20connection%20string%2C%20NextAuth%20secret%2C%20your%20app%20URL%2C%20Repull%20API%20base%2C%20webhook%20signing%20secret&envLink=https%3A%2F%2Fgithub.com%2Fivannikolovbg%2Frepull-channel-manager%23env-vars)

## What you get

- **Multi-tenant workspaces** (one per signed-in user, model already supports multi-seat invites)
- **Email magic-link auth** (NextAuth v5, no third-party account needed to start)
- **Connect Airbnb** through the real Repull OAuth flow
- **Listings, reservations, calendar** — synced into your own Postgres
- **Calendar grid** with manual blocks + per-day price overrides
- **Reservations table** with filters and pagination
- **Webhook ingestion** with HMAC verification + audit log
- **Periodic full-sync** on Vercel Cron every 6 hours
- **Drizzle ORM** schema with migrations checked in
- **Tailwind + Lucide** UI — dark, no UI framework lock-in

## Quick start

```bash
git clone https://github.com/ivannikolovbg/repull-channel-manager
cd repull-channel-manager
cp .env.example .env.local              # then edit
docker compose up -d                    # local Postgres on :5432
pnpm install
pnpm db:push                            # apply schema
pnpm dev                                # http://localhost:3030
```

Sign in (the magic link is printed to the server console in dev), open `/settings`, paste your Repull API key, then go to `/connections` and click *Connect Airbnb*. Listings + reservations land in your DB on consent return.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser / Next.js UI                          │
│   /dashboard  /connections  /listings  /reservations  /settings   │
└──────────────────────────────────────────────────────────────────┘
                         │           │
                         ▼           ▼
              NextAuth session  ──────►  app routes (per-workspace)
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Postgres (Drizzle)                          │
│  workspaces ─┬─► connections                                      │
│              ├─► listings ─► calendar_days                        │
│              ├─► reservations ─► guests                           │
│              ├─► sync_runs                                        │
│              └─► webhook_events                                   │
└──────────────────────────────────────────────────────────────────┘
                         ▲                          ▲
                         │                          │
                  full / incremental         signed webhook
                       sync                   POST /api/webhooks/repull
                         │                          │
                         ▼                          ▼
                   @repull/sdk  ───────►  api.repull.dev
                         │                          │
                         └─► /v1/connect ◄──────────┘ (OAuth bounce)
```

## Stack

| Layer        | Choice                | Why |
|--------------|-----------------------|-----|
| Framework    | Next.js 15 (Turbopack) | Vercel-native, App Router, server actions |
| ORM          | Drizzle ORM           | Type-safe, no codegen step, plays with Vercel/Neon/Supabase |
| DB           | Postgres              | Vercel Postgres, Neon, Supabase, or any plain PG |
| Auth         | NextAuth v5 (email)   | Free, no external service required to start |
| API client   | `@repull/sdk` (vendored) | Single-shot install, no npm publish dependency |
| UI           | Tailwind + Lucide     | Easy to fork; swap for shadcn-ui in 10 min |
| Cron         | Vercel Cron           | Native, zero infra |

## Env vars

See [`.env.example`](./.env.example) for the full list. Minimum to run:

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL`            | yes  | Any Postgres URL. Vercel Postgres / Neon / Supabase / docker. |
| `AUTH_SECRET`             | yes  | `openssl rand -base64 32` |
| `AUTH_URL`                | yes  | Your public URL. `http://localhost:3030` in dev. |
| `REPULL_API_BASE_URL`     | no   | Defaults to `https://api.repull.dev`. |
| `EMAIL_SERVER` + `EMAIL_FROM` | no | If unset, magic links print to the server console. |
| `WEBHOOK_SIGNING_SECRET`  | no   | If set, webhook posts must carry a matching HMAC-SHA256. |
| `CRON_SECRET`             | no   | If set, `/api/cron/sync` requires `Authorization: Bearer ${CRON_SECRET}`. |
| `ENCRYPTION_KEY`          | no   | 32-byte base64. If set, workspace API keys are encrypted at rest. |
| `DEMO_REPULL_API_KEY`     | no   | Real Repull key applied to the seeded `demo@repull.dev` workspace on every demo signin. Without it the demo can browse but not call Repull. |
| `DEMO_SIGNIN`             | no   | Set to `off` to disable the one-click demo button on `/sign-in`. |

## DB schema

Tables (all FK-linked back to `workspaces.id` with `ON DELETE CASCADE`):

- `users`, `accounts`, `sessions`, `verification_tokens` — NextAuth
- `workspaces`, `workspace_members` — multi-tenant
- `connections` — one per Repull-side OAuth grant (Airbnb host etc.)
- `listings` — synced from `/v1/properties` + `/v1/channels/airbnb/listings`
- `guests`, `reservations` — synced from `/v1/reservations`
- `calendar_days` — synced from `/v1/availability/{propertyId}` + manual overrides
- `sync_runs` — full-sync audit trail
- `webhook_events` — raw Repull webhook payload audit log

## Sync mechanics

- **Initial full sync** — fires automatically when `/connections/return` confirms an active Airbnb link. Pulls listings, reservations, and the next 60 days of calendar per listing.
- **Incremental sync** — triggered by webhooks (`reservation.created`, `reservation.updated`, `reservation.cancelled`). Replays listings + reservations.
- **Periodic full-sync** — Vercel Cron at `/api/cron/sync` every 6h. Walks every workspace with a stored API key.
- **Manual sync** — *Sync now* button on the calendar refreshes a single listing.

All upserts are idempotent on `(workspace_id, external_id)`.

## Roadmap

**v0.1 (this release)** — auth, multi-tenant, multi-channel Connect picker, listings, reservations, calendar grid with push-back to Repull, auto-subscribed webhooks, cron sync, sync-run audit page.

**v0.2 (planned)** — guest messaging UI, AI reply suggestions via `/v1/ai`, Stripe-Connect billing hook point.

**v0.3+** — dynamic pricing rules, multi-listing bulk operations, public iCal export per listing.

## Contributing

Issues and PRs welcome. Please:

1. Open an issue first for non-trivial changes so we can talk shape.
2. Run `pnpm typecheck` before opening a PR.
3. Sign your commits if you can.

## Limitations / honest disclosures

- **Single workspace per user** for v1. Multi-workspace switching is a Phase 2 polish — the data model already supports `workspace_members`, but the UI doesn't expose a switcher yet.
- **Calendar push-back** uses `PUT /v1/availability/{propertyId}` and depends on the integer Repull-side property id, which is back-filled from `/v1/properties` on the next full sync. Listings synced exclusively from `channels.airbnb.listings.list` will need one full-sync pass before push-back works.
- **Webhook auto-subscription** runs on first successful connect; the signing secret is captured once and stored in `workspaces.repull_webhook_secret`. Rotate via `POST /v1/webhooks/{id}/rotate-secret` if needed.
- **Alpha**: API surface, schema, and routes may break before v1.0. Pin a commit if you ship a fork.

## License

This template is **NOT** MIT-licensed. See [`LICENSE.md`](./LICENSE.md).

Free for personal use, research, evaluation, and operating against your own listings up to **100 active listings under management**. Commercial license required if you operate a service against third-party listings AND exceed 100 listings or $1M ARR derived. See [`COMMERCIAL.md`](./COMMERCIAL.md) for the plain-English summary.

Inquiries: `hello@repull.dev`.

---

Powered by [Repull](https://repull.dev). AI features powered by Vanio AI.
