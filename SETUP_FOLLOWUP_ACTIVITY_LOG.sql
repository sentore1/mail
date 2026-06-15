-- ============================================================
-- FOLLOW-UP ACTIVITY LOG — run this in Supabase SQL Editor
-- ============================================================
-- Creates the followup_activity_log table and enables
-- auto-followup for all existing users.
-- ============================================================

-- 1. Activity log table
CREATE TABLE IF NOT EXISTS followup_activity_log (
  id                  UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id             UUID         REFERENCES leads(id) ON DELETE SET NULL,
  company_name        TEXT,
  email               TEXT,
  followup_number     INTEGER      NOT NULL DEFAULT 1,
  subject             TEXT,
  body                TEXT,
  status              TEXT         NOT NULL DEFAULT 'sent',
  -- status values: sent | failed | skipped | duplicate_skipped
  error_message       TEXT,
  is_auto             BOOLEAN      NOT NULL DEFAULT false,
  needs_manual_review BOOLEAN      NOT NULL DEFAULT false,
  sent_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fal_user_id  ON followup_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_fal_sent_at  ON followup_activity_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_fal_lead_id  ON followup_activity_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_fal_status   ON followup_activity_log(status);

-- RLS
ALTER TABLE followup_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own activity" ON followup_activity_log;
CREATE POLICY "Users see own activity"
  ON followup_activity_log FOR ALL
  USING (auth.uid() = user_id);

-- 2. Enable auto follow-up for all existing users (only columns that exist in followup_settings)
INSERT INTO followup_settings (
  user_id,
  auto_followup_enabled,
  max_followups
)
SELECT
  id,
  true,   -- auto_followup_enabled
  3       -- max 3 follow-ups per lead
FROM auth.users
ON CONFLICT (user_id) DO UPDATE
  SET auto_followup_enabled = true;

-- 3. Verify
SELECT 'followup_activity_log created ✓' AS result;
SELECT user_id, auto_followup_enabled, max_followups
FROM followup_settings
LIMIT 10;
