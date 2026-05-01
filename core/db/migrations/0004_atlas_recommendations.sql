-- 0004_atlas_recommendations — workspace toggle for the Atlas pricing
-- recommendation overlay on listing calendars. Defaults ON so existing
-- workspaces opt in immediately when the SDK lands.

ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "atlas_recommendations_enabled" boolean NOT NULL DEFAULT true;
