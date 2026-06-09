-- ============================================================
-- Zapier Integration Tables
-- Run this in Supabase SQL Editor → New Query → Run
-- ============================================================

-- 1. Per-user Zapier event preferences
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

-- 2. Zapier delivery log (visible to user for debugging)
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

CREATE INDEX IF NOT EXISTS idx_zapier_log_user_id
  ON public.zapier_delivery_log(user_id);

CREATE INDEX IF NOT EXISTS idx_zapier_log_delivered_at
  ON public.zapier_delivery_log(delivered_at DESC);

-- Done
SELECT 'Zapier tables created successfully' AS status;
