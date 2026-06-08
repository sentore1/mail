-- ============================================================
-- NEW FEATURES TABLES MIGRATION
-- Run this in Supabase SQL Editor
-- Creates tables for: Webhooks, A/B Testing, Sequence Steps
-- ============================================================

-- ── 1. Webhook Configs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_configs (
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

ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_configs_user" ON webhook_configs
  USING (user_id = auth.uid());

-- ── 2. Webhook Delivery Logs ─────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       JSONB,
  status_code   INTEGER,
  success       BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_deliveries_user" ON webhook_deliveries
  USING (user_id = auth.uid());

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_delivered_at ON webhook_deliveries(delivered_at DESC);

-- ── 3. A/B Tests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ab_tests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  variants          JSONB NOT NULL DEFAULT '[]',
  winner_metric     TEXT NOT NULL DEFAULT 'open_rate' CHECK (winner_metric IN ('open_rate','click_rate','reply_rate')),
  auto_pick_winner  BOOLEAN NOT NULL DEFAULT true,
  min_sample_size   INTEGER NOT NULL DEFAULT 50,
  winner_variant_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab_tests_user" ON ab_tests
  USING (user_id = auth.uid());

-- ── 4. A/B Test Stats (per variant) ──────────────────────────
CREATE TABLE IF NOT EXISTS ab_test_stats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_id  TEXT NOT NULL,
  sent        INTEGER NOT NULL DEFAULT 0,
  opened      INTEGER NOT NULL DEFAULT 0,
  clicked     INTEGER NOT NULL DEFAULT 0,
  replied     INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(test_id, variant_id)
);

ALTER TABLE ab_test_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab_test_stats_user" ON ab_test_stats
  USING (user_id = auth.uid());

-- ── 5. Add sequence_steps to followup_settings ───────────────
-- (stores JSON blob of step configs from SequenceBuilderModule)
ALTER TABLE followup_settings
  ADD COLUMN IF NOT EXISTS sequence_steps TEXT,  -- JSON array of steps
  ADD COLUMN IF NOT EXISTS send_window_start TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS send_window_end TEXT DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS business_days_only BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS random_delay_minutes INTEGER DEFAULT 30;

-- ── 6. Add ab_test_id to sent_emails ─────────────────────────
-- So we can track which variant each sent email belongs to
ALTER TABLE sent_emails
  ADD COLUMN IF NOT EXISTS ab_test_id UUID REFERENCES ab_tests(id),
  ADD COLUMN IF NOT EXISTS ab_variant_id TEXT;

-- ── 7. Upsert function for A/B stats ─────────────────────────
CREATE OR REPLACE FUNCTION increment_ab_stat(
  p_test_id    UUID,
  p_user_id    UUID,
  p_variant_id TEXT,
  p_column     TEXT  -- 'sent', 'opened', 'clicked', 'replied'
) RETURNS void AS $$
BEGIN
  INSERT INTO ab_test_stats(test_id, user_id, variant_id)
    VALUES (p_test_id, p_user_id, p_variant_id)
    ON CONFLICT (test_id, variant_id) DO NOTHING;

  IF p_column = 'sent' THEN
    UPDATE ab_test_stats SET sent    = sent    + 1, updated_at = now() WHERE test_id = p_test_id AND variant_id = p_variant_id;
  ELSIF p_column = 'opened' THEN
    UPDATE ab_test_stats SET opened  = opened  + 1, updated_at = now() WHERE test_id = p_test_id AND variant_id = p_variant_id;
  ELSIF p_column = 'clicked' THEN
    UPDATE ab_test_stats SET clicked = clicked + 1, updated_at = now() WHERE test_id = p_test_id AND variant_id = p_variant_id;
  ELSIF p_column = 'replied' THEN
    UPDATE ab_test_stats SET replied = replied + 1, updated_at = now() WHERE test_id = p_test_id AND variant_id = p_variant_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ab_tests_user_id ON ab_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_stats_test_id ON ab_test_stats(test_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_user_id ON webhook_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_ab_test_id ON sent_emails(ab_test_id) WHERE ab_test_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_user_id ON custom_field_definitions(user_id);

-- ── 9. Custom Field Definitions ──────────────────────────────
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  key              TEXT NOT NULL,              -- snake_case, used as {{key}} in templates
  type             TEXT NOT NULL DEFAULT 'text'
                     CHECK (type IN ('text','number','date','dropdown','boolean','url')),
  options          TEXT[],                     -- for dropdown fields
  required         BOOLEAN NOT NULL DEFAULT false,
  show_in_crm      BOOLEAN NOT NULL DEFAULT true,
  use_in_templates BOOLEAN NOT NULL DEFAULT false,
  "order"          INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_field_defs_user" ON custom_field_definitions
  USING (user_id = auth.uid());

-- ── 10. Custom Field Values (per lead) ───────────────────────
CREATE TABLE IF NOT EXISTS lead_custom_field_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  field_id     UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lead_id, field_id)
);

ALTER TABLE lead_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_custom_values_user" ON lead_custom_field_values
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_lead_custom_values_lead_id ON lead_custom_field_values(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_custom_values_field_id ON lead_custom_field_values(field_id);

-- ── 11. Integration Configs ──────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_configs (
  id              TEXT PRIMARY KEY,  -- "{user_id}:{integration_id}"
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id  TEXT NOT NULL,     -- "hubspot", "salesforce", etc.
  status          TEXT NOT NULL DEFAULT 'connected',
  detail          TEXT,              -- display string e.g. portal ID
  config          JSONB,             -- encrypted or raw config (API keys etc.)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, integration_id)
);

ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_configs_user" ON integration_configs
  USING (user_id = auth.uid());

-- ── 12. Add OAuth columns to smtp_accounts and email_inbox_config ──
ALTER TABLE smtp_accounts
  ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'password',
  ADD COLUMN IF NOT EXISTS oauth_access_token TEXT,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMPTZ;

ALTER TABLE email_inbox_config
  ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'password';

-- ── 13. WhatsApp Notification Settings ──────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_notification_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  whatsapp_number  TEXT NOT NULL DEFAULT '',
  enabled          BOOLEAN NOT NULL DEFAULT false,
  sender_name      TEXT NOT NULL DEFAULT '',
  events           TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_settings_user" ON whatsapp_notification_settings
  USING (user_id = auth.uid());

-- ── 14. WhatsApp Delivery Log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_delivery_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  to_number     TEXT NOT NULL,
  message       TEXT,
  success       BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_log_user" ON whatsapp_delivery_log
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_user_id ON whatsapp_delivery_log(user_id);

-- Done!
SELECT 'Migration complete — all new feature tables created successfully' AS status;