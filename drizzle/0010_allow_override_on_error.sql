-- Migration: add allow_override_on_error to dashboard_settings
-- When enabled, operators can execute actions on cards with error-level
-- validation failures after confirming via a modal. All overrides are
-- logged in action_log metadata as { operator_override: true }.

ALTER TABLE "dashboard_settings"
  ADD COLUMN IF NOT EXISTS "allow_override_on_error" boolean NOT NULL DEFAULT false;
