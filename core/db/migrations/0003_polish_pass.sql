-- 0001_polish_pass — wires webhook-subscription metadata onto workspaces and
-- calendar-day push-back tracking onto calendar_days.

ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "repull_webhook_id" text,
  ADD COLUMN IF NOT EXISTS "repull_webhook_secret" text,
  ADD COLUMN IF NOT EXISTS "repull_webhook_url" text,
  ADD COLUMN IF NOT EXISTS "auto_push_calendar" boolean NOT NULL DEFAULT true;

ALTER TABLE "calendar_days"
  ADD COLUMN IF NOT EXISTS "repull_synced_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "repull_sync_error" text;
