-- ============================================================
-- FIX: Supabase 1000-row limit
-- Run ALL of this in Supabase SQL Editor
-- ============================================================

-- ── STEP 1: Confirm your real counts (run this first to see actual numbers) ──
SELECT
  COUNT(*)                                                           AS total_sent,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL)                     AS total_opened,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)                    AS total_clicked,
  COUNT(*) FILTER (WHERE replied_at IS NOT NULL)                    AS total_replied,
  COUNT(*) FILTER (WHERE status = 'bounced')                        AS total_bounced,
  COUNT(*) FILTER (WHERE opened_at IS NULL
    AND status NOT IN ('bounced','failed'))                         AS not_opened,
  ROUND(
    COUNT(*) FILTER (WHERE opened_at IS NOT NULL) * 100.0
    / NULLIF(COUNT(*), 0), 1
  )                                                                  AS open_rate_pct
FROM public.sent_emails;

-- ── STEP 2: Install RPC helper functions (these bypass PostgREST row limit) ──

CREATE OR REPLACE FUNCTION public.get_sent_email_stats(
  p_user_id   UUID,
  p_since     TIMESTAMPTZ DEFAULT NULL,
  p_until     TIMESTAMPTZ DEFAULT NULL,
  p_campaign  UUID        DEFAULT NULL
)
RETURNS TABLE (
  total_sent       BIGINT,
  total_opened     BIGINT,
  total_clicked    BIGINT,
  total_replied    BIGINT,
  total_bounced    BIGINT,
  total_failed     BIGINT,
  total_followups  BIGINT,
  total_not_opened BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)                                                                    AS total_sent,
    COUNT(*) FILTER (WHERE opened_at  IS NOT NULL)                             AS total_opened,
    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)                             AS total_clicked,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL)                             AS total_replied,
    COUNT(*) FILTER (WHERE status = 'bounced')                                 AS total_bounced,
    COUNT(*) FILTER (WHERE status = 'failed')                                  AS total_failed,
    COUNT(*) FILTER (WHERE is_followup = true)                                 AS total_followups,
    COUNT(*) FILTER (WHERE opened_at IS NULL
      AND status NOT IN ('bounced','failed'))                                  AS total_not_opened
  FROM public.sent_emails
  WHERE user_id = p_user_id
    AND (p_since    IS NULL OR sent_at >= p_since)
    AND (p_until    IS NULL OR sent_at <= p_until)
    AND (p_campaign IS NULL OR campaign_id = p_campaign);
$$;

GRANT EXECUTE ON FUNCTION public.get_sent_email_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sent_email_stats TO service_role;

-- ── Monthly variant ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_monthly_email_stats(
  p_user_id UUID,
  p_year    INT,
  p_month   INT
)
RETURNS TABLE (
  total_sent       BIGINT,
  total_opened     BIGINT,
  total_clicked    BIGINT,
  total_replied    BIGINT,
  total_bounced    BIGINT,
  total_followups  BIGINT,
  total_not_opened BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)                                                                    AS total_sent,
    COUNT(*) FILTER (WHERE opened_at  IS NOT NULL)                             AS total_opened,
    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)                             AS total_clicked,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL)                             AS total_replied,
    COUNT(*) FILTER (WHERE status = 'bounced')                                 AS total_bounced,
    COUNT(*) FILTER (WHERE is_followup = true)                                 AS total_followups,
    COUNT(*) FILTER (WHERE opened_at IS NULL
      AND status NOT IN ('bounced','failed'))                                  AS total_not_opened
  FROM public.sent_emails
  WHERE user_id = p_user_id
    AND sent_at >= date_trunc('month', make_date(p_year, p_month, 1))
    AND sent_at <  date_trunc('month', make_date(p_year, p_month, 1))
                   + INTERVAL '1 month';
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_email_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_email_stats TO service_role;

-- ── Daily breakdown ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_daily_email_stats(
  p_user_id UUID,
  p_since   TIMESTAMPTZ,
  p_until   TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  day       DATE,
  sent      BIGINT,
  opened    BIGINT,
  replied   BIGINT,
  bounced   BIGINT,
  followups BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    DATE(sent_at)                                              AS day,
    COUNT(*)                                                   AS sent,
    COUNT(*) FILTER (WHERE opened_at  IS NOT NULL)             AS opened,
    COUNT(*) FILTER (WHERE replied_at IS NOT NULL)             AS replied,
    COUNT(*) FILTER (WHERE status = 'bounced')                 AS bounced,
    COUNT(*) FILTER (WHERE is_followup = true)                 AS followups
  FROM public.sent_emails
  WHERE user_id = p_user_id
    AND sent_at >= p_since
    AND sent_at <= p_until
  GROUP BY DATE(sent_at)
  ORDER BY DATE(sent_at);
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_email_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_email_stats TO service_role;

-- ── STEP 3: Verify the functions work ────────────────────────────────────────
-- Replace the UUID below with your actual user_id from auth.users
-- SELECT * FROM public.get_monthly_email_stats('YOUR-USER-UUID-HERE', 2026, 6);

-- ── STEP 4: Increase PostgREST max rows in Supabase Dashboard ────────────────
-- Go to: https://supabase.com/dashboard/project/bdfzckpwasyycwjggsfb/settings/api
-- Find "Max Rows" → change from 1000 to 100000 → Save
-- ============================================================
