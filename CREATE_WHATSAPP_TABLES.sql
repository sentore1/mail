-- ============================================================
-- WhatsApp Notification Tables
-- Run this in Supabase SQL Editor → New Query → Run
-- ============================================================

-- 1. Settings table (one row per user)
CREATE TABLE IF NOT EXISTS public.whatsapp_notification_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number  TEXT NOT NULL DEFAULT '',
  enabled          BOOLEAN NOT NULL DEFAULT false,
  sender_name      TEXT NOT NULL DEFAULT '',
  events           TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_settings_user_unique UNIQUE (user_id)
);

-- Row level security
ALTER TABLE public.whatsapp_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_settings_user" ON public.whatsapp_notification_settings;
CREATE POLICY "whatsapp_settings_user" ON public.whatsapp_notification_settings
  FOR ALL USING (user_id = auth.uid());

-- 2. Delivery log table
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

DROP POLICY IF EXISTS "whatsapp_log_user" ON public.whatsapp_delivery_log;
CREATE POLICY "whatsapp_log_user" ON public.whatsapp_delivery_log
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_user_id
  ON public.whatsapp_delivery_log(user_id);

-- Done
SELECT 'WhatsApp tables created successfully' AS status;
