-- ============================================================
-- FOLLOW-UP SYSTEM UPGRADE
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Add SMTP threading columns to sent_emails ─────────────────────────────
ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS references_header TEXT,
  ADD COLUMN IF NOT EXISTS is_followup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_style TEXT DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;

-- ── 2. Add AI classification to email_replies ─────────────────────────────────
ALTER TABLE public.email_replies
  ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS is_auto_reply BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bounce BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_unsubscribe BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw_headers TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT;

-- ── 3. Extend followup_settings for advanced options ─────────────────────────
ALTER TABLE public.followup_settings
  ADD COLUMN IF NOT EXISTS sending_window_start INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS sending_window_end INTEGER DEFAULT 18,
  ADD COLUMN IF NOT EXISTS business_days_only BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS random_delay_minutes INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS followup_subject_prefix TEXT DEFAULT 'Re: ',
  ADD COLUMN IF NOT EXISTS use_ai_generation BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_followup_style TEXT DEFAULT 'professional';

-- ── 4. Create ai_followup_generations table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_followup_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  followup_number INTEGER NOT NULL DEFAULT 1,
  style TEXT DEFAULT 'professional',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  model_used TEXT,
  decision_reason TEXT,
  lead_opens INTEGER DEFAULT 0,
  lead_clicks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Add unsubscribe_events table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unsubscribe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  source TEXT DEFAULT 'reply',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Add lead_notes table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. Extend leads table for followup tracking ──────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_unsubscribed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;

-- ── 8. Extend email_replies for AI classification ────────────────────────────
-- classification values: interested | not_interested | meeting_request | unsubscribe | auto_reply | neutral | positive | negative
UPDATE public.email_replies 
SET classification = CASE 
  WHEN is_positive = true AND sentiment = 'interested' THEN 'interested'
  WHEN is_positive = true THEN 'positive'
  WHEN sentiment = 'not_interested' THEN 'not_interested'
  ELSE 'neutral'
END
WHERE classification IS NULL OR classification = '';

-- ── 9. Update followup_due view to include threading info ────────────────────
CREATE OR REPLACE VIEW public.followup_due AS
SELECT
  se.id AS sent_email_id,
  se.user_id,
  se.lead_id,
  se.campaign_id,
  se.subject AS original_subject,
  se.body AS original_body,
  se.sent_at,
  se.followup_count,
  se.next_followup_at,
  se.smtp_message_id,
  se.thread_id,
  se.in_reply_to,
  se.references_header,
  l.company_name,
  l.email AS lead_email,
  l.niche,
  l.location,
  l.company_context,
  l.status AS lead_status,
  l.open_count,
  l.click_count,
  l.is_unsubscribed,
  COALESCE(fs.max_followups, 5) AS max_followups,
  COALESCE(fs.default_delay_days, 3) AS default_delay_days,
  COALESCE(fs.stop_on_reply, true) AS stop_on_reply,
  COALESCE(fs.followup_tone, 'professional') AS followup_tone,
  COALESCE(fs.use_ai_generation, false) AS use_ai_generation,
  COALESCE(fs.ai_followup_style, 'professional') AS ai_followup_style,
  COALESCE(fs.business_days_only, true) AS business_days_only,
  COALESCE(fs.sending_window_start, 8) AS sending_window_start,
  COALESCE(fs.sending_window_end, 18) AS sending_window_end,
  COALESCE(fs.random_delay_minutes, 15) AS random_delay_minutes,
  fs.your_company,
  fs.your_service,
  fs.followup_subject_prefix
FROM public.sent_emails se
JOIN public.leads l ON l.id = se.lead_id
LEFT JOIN public.followup_settings fs ON fs.user_id = se.user_id
WHERE
  se.followup_stopped = false
  AND se.next_followup_at IS NOT NULL
  AND se.next_followup_at <= NOW()
  AND se.followup_count < COALESCE(fs.max_followups, 5)
  AND l.email IS NOT NULL
  AND l.is_unsubscribed = false
  AND se.status NOT IN ('bounced', 'replied')
  AND l.status NOT IN ('bounced', 'unsubscribed', 'Replied', 'Interested');

-- ── 10. Indexes for new tables ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_followup_user_id ON public.ai_followup_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_sent_email ON public.ai_followup_generations(sent_email_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_lead ON public.ai_followup_generations(lead_id);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_user ON public.unsubscribe_events(user_id);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_email ON public.unsubscribe_events(email);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_thread ON public.sent_emails(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sent_emails_smtp_msg_id ON public.sent_emails(smtp_message_id) WHERE smtp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sent_emails_parent ON public.sent_emails(parent_sent_email_id) WHERE parent_sent_email_id IS NOT NULL;

-- ── 11. RLS for new tables ────────────────────────────────────────────────────
ALTER TABLE public.ai_followup_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unsubscribe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own ai_followup_generations" ON public.ai_followup_generations;
CREATE POLICY "Users manage own ai_followup_generations" ON public.ai_followup_generations
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own unsubscribe_events" ON public.unsubscribe_events;
CREATE POLICY "Users manage own unsubscribe_events" ON public.unsubscribe_events
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own lead_notes" ON public.lead_notes;
CREATE POLICY "Users manage own lead_notes" ON public.lead_notes
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 12. Enable realtime for new tables ────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_followup_generations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_notes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ── 13. Handle unsubscribe trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_unsubscribe_reply()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.classification = 'unsubscribe' OR NEW.is_unsubscribe = true THEN
    UPDATE public.leads 
    SET is_unsubscribed = true, status = 'unsubscribed', updated_at = NOW()
    WHERE id = NEW.lead_id AND user_id = NEW.user_id;

    UPDATE public.sent_emails 
    SET followup_stopped = true, next_followup_at = NULL
    WHERE lead_id = NEW.lead_id AND user_id = NEW.user_id;

    INSERT INTO public.unsubscribe_events (user_id, lead_id, email, source)
    SELECT NEW.user_id, NEW.lead_id, NEW.from_email, 'reply'
    WHERE NEW.lead_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS unsubscribe_reply_trigger ON public.email_replies;
CREATE TRIGGER unsubscribe_reply_trigger
  AFTER INSERT OR UPDATE ON public.email_replies
  FOR EACH ROW EXECUTE FUNCTION public.handle_unsubscribe_reply();

-- ── 14. Update open_count on lead when email opened ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_email_open_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opened_at IS NOT NULL AND OLD.opened_at IS NULL THEN
    UPDATE public.leads 
    SET open_count = COALESCE(open_count, 0) + 1, updated_at = NOW()
    WHERE id = NEW.lead_id;
  END IF;
  IF NEW.clicked_at IS NOT NULL AND OLD.clicked_at IS NULL THEN
    UPDATE public.leads 
    SET click_count = COALESCE(click_count, 0) + 1, updated_at = NOW()
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS email_open_count_trigger ON public.sent_emails;
CREATE TRIGGER email_open_count_trigger
  AFTER UPDATE ON public.sent_emails
  FOR EACH ROW EXECUTE FUNCTION public.handle_email_open_count();

-- ── Done! ──────────────────────────────────────────────────────────────────────
SELECT 'Follow-Up System Upgrade complete!' AS result;
