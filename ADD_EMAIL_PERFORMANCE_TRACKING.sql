-- ============================================================
-- EMAIL PERFORMANCE TRACKING
-- Answers Question 11: Track what works, learn over time
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Email performance log ────────────────────────────────────────────────────
-- Tracks per-email metadata so the platform can learn which patterns
-- (subject formulas, opening hooks, CTA styles, industries) drive opens and replies.

CREATE TABLE IF NOT EXISTS public.email_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  -- What was in the email
  niche TEXT,
  location TEXT,
  subject_formula TEXT,          -- e.g. "question_about_X", "still_manual", "worth_2_min"
  opening_hook_type TEXT,        -- "website_specific", "news_signal", "industry_fallback"
  cta_type TEXT,                 -- "soft_question", "hard_book"
  personalization_score INTEGER,
  quality_score INTEGER,
  word_count INTEGER,
  data_source TEXT,              -- "ai_personalized" | "ai_industry" | "template_industry" | "template_fallback"
  ai_model TEXT,

  -- Performance outcomes
  was_opened BOOLEAN DEFAULT false,
  was_clicked BOOLEAN DEFAULT false,
  was_replied BOOLEAN DEFAULT false,
  reply_sentiment TEXT,          -- "positive", "negative", "neutral", "auto_reply"
  days_to_reply INTEGER,         -- how many days until reply (if any)

  -- Timing
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Industry performance summary (materialized via view) ─────────────────────
CREATE OR REPLACE VIEW public.email_performance_by_niche AS
SELECT
  niche,
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE was_opened) AS total_opened,
  COUNT(*) FILTER (WHERE was_replied) AS total_replied,
  COUNT(*) FILTER (WHERE reply_sentiment = 'positive') AS positive_replies,
  ROUND(AVG(personalization_score), 1) AS avg_personalization_score,
  ROUND(AVG(quality_score), 1) AS avg_quality_score,
  ROUND(
    COUNT(*) FILTER (WHERE was_opened)::numeric / NULLIF(COUNT(*), 0) * 100, 1
  ) AS open_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE was_replied)::numeric / NULLIF(COUNT(*), 0) * 100, 1
  ) AS reply_rate_pct,
  -- Best performing subject formula for this niche
  MODE() WITHIN GROUP (ORDER BY subject_formula) FILTER (WHERE was_opened) AS best_subject_formula,
  -- Best performing data source for this niche
  MODE() WITHIN GROUP (ORDER BY data_source) FILTER (WHERE was_replied) AS best_data_source
FROM public.email_performance
GROUP BY niche
ORDER BY reply_rate_pct DESC NULLS LAST;

-- ── Subject formula performance ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.subject_formula_performance AS
SELECT
  subject_formula,
  niche,
  COUNT(*) AS total_sent,
  ROUND(COUNT(*) FILTER (WHERE was_opened)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS open_rate_pct,
  ROUND(COUNT(*) FILTER (WHERE was_replied)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate_pct
FROM public.email_performance
WHERE subject_formula IS NOT NULL
GROUP BY subject_formula, niche
HAVING COUNT(*) >= 5
ORDER BY reply_rate_pct DESC NULLS LAST;

-- ── Opening hook performance ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.opening_hook_performance AS
SELECT
  opening_hook_type,
  niche,
  COUNT(*) AS total_sent,
  ROUND(COUNT(*) FILTER (WHERE was_opened)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS open_rate_pct,
  ROUND(COUNT(*) FILTER (WHERE was_replied)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate_pct
FROM public.email_performance
WHERE opening_hook_type IS NOT NULL
GROUP BY opening_hook_type, niche
HAVING COUNT(*) >= 5
ORDER BY reply_rate_pct DESC NULLS LAST;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_email_performance_user ON public.email_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_email_performance_niche ON public.email_performance(niche);
CREATE INDEX IF NOT EXISTS idx_email_performance_sent ON public.email_performance(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_performance_opened ON public.email_performance(was_opened);
CREATE INDEX IF NOT EXISTS idx_email_performance_replied ON public.email_performance(was_replied);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.email_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own email_performance" ON public.email_performance;
CREATE POLICY "Users manage own email_performance" ON public.email_performance
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Function: log email performance ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_email_performance(
  p_user_id UUID,
  p_sent_email_id UUID,
  p_lead_id UUID,
  p_niche TEXT,
  p_location TEXT,
  p_subject_formula TEXT,
  p_opening_hook_type TEXT,
  p_cta_type TEXT,
  p_personalization_score INTEGER,
  p_quality_score INTEGER,
  p_word_count INTEGER,
  p_data_source TEXT,
  p_ai_model TEXT,
  p_sent_at TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.email_performance (
    user_id, sent_email_id, lead_id, niche, location,
    subject_formula, opening_hook_type, cta_type,
    personalization_score, quality_score, word_count,
    data_source, ai_model, sent_at
  ) VALUES (
    p_user_id, p_sent_email_id, p_lead_id, p_niche, p_location,
    p_subject_formula, p_opening_hook_type, p_cta_type,
    p_personalization_score, p_quality_score, p_word_count,
    p_data_source, p_ai_model, p_sent_at
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger: auto-update performance on email open/reply ─────────────────────
CREATE OR REPLACE FUNCTION public.sync_email_performance()
RETURNS TRIGGER AS $$
BEGIN
  -- Update open flag
  IF NEW.opened_at IS NOT NULL AND OLD.opened_at IS NULL THEN
    UPDATE public.email_performance
    SET was_opened = true, opened_at = NEW.opened_at, updated_at = NOW()
    WHERE sent_email_id = NEW.id;
  END IF;

  -- Update reply flag
  IF NEW.replied_at IS NOT NULL AND OLD.replied_at IS NULL THEN
    UPDATE public.email_performance
    SET
      was_replied = true,
      replied_at = NEW.replied_at,
      days_to_reply = EXTRACT(DAY FROM (NEW.replied_at - NEW.sent_at))::INTEGER,
      updated_at = NOW()
    WHERE sent_email_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_email_performance_trigger ON public.sent_emails;
CREATE TRIGGER sync_email_performance_trigger
  AFTER UPDATE ON public.sent_emails
  FOR EACH ROW EXECUTE FUNCTION public.sync_email_performance();

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_performance;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
