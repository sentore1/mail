-- ============================================================
-- PRYRO MAIL — COMPLETE MIGRATION
-- Paste this entire file into Supabase SQL Editor and click Run
-- ============================================================

-- ── 1. WhatsApp Notification Settings ────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_notification_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number  TEXT NOT NULL DEFAULT '',
  enabled          BOOLEAN NOT NULL DEFAULT false,
  sender_name      TEXT NOT NULL DEFAULT '',
  events           TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wa_settings_user_unique UNIQUE (user_id)
);
ALTER TABLE public.whatsapp_notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_settings_user" ON public.whatsapp_notification_settings;
CREATE POLICY "wa_settings_user" ON public.whatsapp_notification_settings
  FOR ALL USING (user_id = auth.uid());

-- ── 2. WhatsApp Delivery Log ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_delivery_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  to_number     TEXT NOT NULL,
  message       TEXT,
  success       BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_delivery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_log_user" ON public.whatsapp_delivery_log;
CREATE POLICY "wa_log_user" ON public.whatsapp_delivery_log
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_wa_log_user ON public.whatsapp_delivery_log(user_id);

-- ── 3. Zapier Event Settings ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zapier_event_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  events      TEXT[] NOT NULL DEFAULT '{"reply.received","email.opened","email.clicked","email.bounced"}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zapier_settings_user_unique UNIQUE (user_id)
);
ALTER TABLE public.zapier_event_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zapier_settings_user" ON public.zapier_event_settings;
CREATE POLICY "zapier_settings_user" ON public.zapier_event_settings
  FOR ALL USING (user_id = auth.uid());

-- ── 4. Zapier Delivery Log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zapier_delivery_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       JSONB,
  success       BOOLEAN NOT NULL DEFAULT false,
  status_code   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.zapier_delivery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zapier_log_user" ON public.zapier_delivery_log;
CREATE POLICY "zapier_log_user" ON public.zapier_delivery_log
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_zapier_log_user ON public.zapier_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_zapier_log_time ON public.zapier_delivery_log(delivered_at DESC);

-- ── 5. Webhook Configs (user-defined endpoints) ───────────────
CREATE TABLE IF NOT EXISTS public.webhook_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  events       TEXT[] NOT NULL DEFAULT '{}',
  secret       TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook_configs_user" ON public.webhook_configs;
CREATE POLICY "webhook_configs_user" ON public.webhook_configs
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_webhook_configs_user ON public.webhook_configs(user_id);

-- ── 6. Webhook Delivery Log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID NOT NULL REFERENCES public.webhook_configs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       JSONB,
  status_code   INTEGER,
  success       BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook_deliveries_user" ON public.webhook_deliveries;
CREATE POLICY "webhook_deliveries_user" ON public.webhook_deliveries
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_wid ON public.webhook_deliveries(webhook_id);

-- ── 7. A/B Tests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ab_tests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','paused','completed')),
  variants          JSONB NOT NULL DEFAULT '[]',
  winner_metric     TEXT NOT NULL DEFAULT 'open_rate'
                      CHECK (winner_metric IN ('open_rate','click_rate','reply_rate')),
  auto_pick_winner  BOOLEAN NOT NULL DEFAULT true,
  min_sample_size   INTEGER NOT NULL DEFAULT 50,
  winner_variant_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ab_tests_user" ON public.ab_tests;
CREATE POLICY "ab_tests_user" ON public.ab_tests
  FOR ALL USING (user_id = auth.uid());

-- ── 8. A/B Test Stats ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ab_test_stats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id  TEXT NOT NULL,
  sent        INTEGER NOT NULL DEFAULT 0,
  opened      INTEGER NOT NULL DEFAULT 0,
  clicked     INTEGER NOT NULL DEFAULT 0,
  replied     INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(test_id, variant_id)
);
ALTER TABLE public.ab_test_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ab_test_stats_user" ON public.ab_test_stats;
CREATE POLICY "ab_test_stats_user" ON public.ab_test_stats
  FOR ALL USING (user_id = auth.uid());

-- ── 9. Custom Field Definitions ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  key              TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'text'
                     CHECK (type IN ('text','number','date','dropdown','boolean','url')),
  options          TEXT[],
  required         BOOLEAN NOT NULL DEFAULT false,
  show_in_crm      BOOLEAN NOT NULL DEFAULT true,
  use_in_templates BOOLEAN NOT NULL DEFAULT false,
  "order"          INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "custom_field_defs_user" ON public.custom_field_definitions;
CREATE POLICY "custom_field_defs_user" ON public.custom_field_definitions
  FOR ALL USING (user_id = auth.uid());

-- ── 10. Custom Field Values ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_custom_field_values (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  field_id   UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lead_id, field_id)
);
ALTER TABLE public.lead_custom_field_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_custom_values_user" ON public.lead_custom_field_values;
CREATE POLICY "lead_custom_values_user" ON public.lead_custom_field_values
  FOR ALL USING (user_id = auth.uid());

-- ── 11. Integration Configs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_configs (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'connected',
  detail          TEXT,
  config          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, integration_id)
);
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "integration_configs_user" ON public.integration_configs;
CREATE POLICY "integration_configs_user" ON public.integration_configs
  FOR ALL USING (user_id = auth.uid());

-- ── 12. New columns on followup_settings ─────────────────────
ALTER TABLE public.followup_settings
  ADD COLUMN IF NOT EXISTS sequence_steps TEXT,
  ADD COLUMN IF NOT EXISTS send_window_start TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS send_window_end TEXT DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS business_days_only BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS random_delay_minutes INTEGER DEFAULT 30;

-- ── 13. New columns on sent_emails ───────────────────────────
ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS ab_test_id UUID,
  ADD COLUMN IF NOT EXISTS ab_variant_id TEXT;

-- ── 14. New columns on smtp_accounts (OAuth support) ─────────
ALTER TABLE public.smtp_accounts
  ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'password',
  ADD COLUMN IF NOT EXISTS oauth_access_token TEXT,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMPTZ;

-- ── 15. New column on email_inbox_config ─────────────────────
ALTER TABLE public.email_inbox_config
  ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'password';

-- Done
SELECT 'All migrations completed successfully' AS status;
