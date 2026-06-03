-- ============================================================
-- PRODUCTION-READY AI FOLLOW-UP SYSTEM
-- Complete threaded email system with unlimited follow-ups
-- ============================================================

-- ── 1. Enhanced Email Threading Tables ──────────────────────────────────────

-- Email threads table - tracks conversation threads
CREATE TABLE IF NOT EXISTS public.email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id UUID,
  
  -- Thread identifiers
  thread_id TEXT UNIQUE NOT NULL, -- Our internal thread ID
  subject TEXT NOT NULL,
  
  -- Email headers for threading
  initial_message_id TEXT UNIQUE, -- Message-ID of first email
  
  -- Thread status
  status TEXT DEFAULT 'active', -- active, replied, bounced, unsubscribed, completed
  
  -- Counts
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  
  -- Timestamps
  first_sent_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Enhanced Sent Emails columns ─────────────────────────────────────────
ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS references_header TEXT,
  ADD COLUMN IF NOT EXISTS email_thread_id UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_number INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_followup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS style TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS from_name TEXT;

-- ── 3. Campaign Follow-Up Sequences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Sequence config
  sequence_number INTEGER NOT NULL DEFAULT 1,
  name TEXT DEFAULT 'Follow-Up',
  
  -- Timing
  delay_days INTEGER NOT NULL DEFAULT 3,
  delay_hours INTEGER DEFAULT 0,
  business_days_only BOOLEAN DEFAULT true,
  
  -- Sending window
  send_window_start TIME DEFAULT '09:00',
  send_window_end TIME DEFAULT '17:00',
  timezone TEXT DEFAULT 'UTC',
  
  -- Random delay (anti-spam)
  random_delay_minutes INTEGER DEFAULT 30,
  
  -- Email content
  subject_template TEXT,
  body_template TEXT,
  
  -- AI config
  ai_generate BOOLEAN DEFAULT true,
  style TEXT DEFAULT 'professional',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Campaign Settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_followup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Follow-up rules
  enabled BOOLEAN DEFAULT true,
  max_followups INTEGER DEFAULT 5,
  stop_on_reply BOOLEAN DEFAULT true,
  stop_on_auto_reply BOOLEAN DEFAULT false,
  stop_on_bounce BOOLEAN DEFAULT true,
  stop_on_unsubscribe BOOLEAN DEFAULT true,
  
  -- AI config
  ai_enabled BOOLEAN DEFAULT true,
  default_style TEXT DEFAULT 'professional',
  
  -- Context for AI
  your_company TEXT,
  your_service TEXT,
  value_proposition TEXT,
  
  -- Deliverability
  daily_limit INTEGER,
  hourly_limit INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. Enhanced Follow-Up Queue ─────────────────────────────────────────────
DROP TABLE IF EXISTS public.followup_queue CASCADE;
CREATE TABLE public.followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Relations
  thread_id UUID REFERENCES public.email_threads(id) ON DELETE CASCADE,
  sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id UUID,
  sequence_id UUID REFERENCES public.campaign_sequences(id) ON DELETE SET NULL,
  
  -- Follow-up metadata
  followup_number INTEGER NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ NOT NULL,
  scheduled_window_end TIMESTAMPTZ,
  
  -- Content (can be pre-generated or NULL for AI generation at send time)
  subject TEXT,
  body TEXT,
  html_body TEXT,
  
  -- AI metadata
  ai_generated BOOLEAN DEFAULT false,
  generation_context JSONB,
  style TEXT,
  model_used TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, processing, sent, failed, skipped, cancelled
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  skip_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- SMTP
  smtp_account_id UUID,
  message_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Enhanced Email Replies ────────────────────────────────────────────────
ALTER TABLE public.email_replies
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS html_body TEXT,
  ADD COLUMN IF NOT EXISTS is_auto_reply BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bounce BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_classification TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS headers JSONB,
  ADD COLUMN IF NOT EXISTS raw_size INTEGER;

-- ── 7. AI Generations Log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Context
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  followup_queue_id UUID REFERENCES public.followup_queue(id) ON DELETE SET NULL,
  
  -- Generation type
  type TEXT NOT NULL, -- 'followup', 'reply_classification', 'subject_line', 'reply_draft'
  
  -- Input context
  input_context JSONB,
  
  -- Output
  subject TEXT,
  body TEXT,
  classification TEXT,
  style TEXT,
  model_used TEXT,
  
  -- Decision engine
  decision_reason TEXT,
  engagement_signals JSONB,
  
  -- Status
  status TEXT DEFAULT 'generated', -- generated, used, rejected
  used_at TIMESTAMPTZ,
  
  -- Tokens & cost
  tokens_used INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. Tracking Events ──────────────────────────────────────────────────────
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_number INTEGER,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS device TEXT,
  ADD COLUMN IF NOT EXISTS browser TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT;

-- ── 9. Unsubscribe Events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unsubscribe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  
  -- Source
  source TEXT DEFAULT 'link', -- link, reply, manual, bounce
  sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  
  -- Request details
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 10. IMAP Configuration (enhanced) ───────────────────────────────────────
ALTER TABLE public.email_inbox_config
  ADD COLUMN IF NOT EXISTS smtp_account_id UUID REFERENCES public.smtp_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS use_smtp_credentials BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS scan_interval_minutes INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_uid INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inbox_folder TEXT DEFAULT 'INBOX',
  ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS emails_scanned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replies_found INTEGER DEFAULT 0;

-- ── 11. Lead Status Enhancement ─────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_stopped BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_reason TEXT,
  ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_score INTEGER DEFAULT 0;

-- ── 12. Indexes for Performance ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_email_threads_user_id ON public.email_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_lead_id ON public.email_threads(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_status ON public.email_threads(status);
CREATE INDEX IF NOT EXISTS idx_email_threads_thread_id ON public.email_threads(thread_id);

CREATE INDEX IF NOT EXISTS idx_followup_queue_user_id ON public.followup_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_followup_queue_status ON public.followup_queue(status);
CREATE INDEX IF NOT EXISTS idx_followup_queue_scheduled ON public.followup_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_followup_queue_lead_id ON public.followup_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_queue_thread ON public.followup_queue(thread_id);

CREATE INDEX IF NOT EXISTS idx_campaign_sequences_campaign ON public.campaign_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_generations_user ON public.ai_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_generations_lead ON public.ai_generations(lead_id);
CREATE INDEX IF NOT EXISTS idx_unsubscribe_email ON public.unsubscribe_events(email);
CREATE INDEX IF NOT EXISTS idx_sent_emails_message_id ON public.sent_emails(message_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_thread ON public.sent_emails(email_thread_id);

-- ── 13. RLS Policies ────────────────────────────────────────────────────────
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_followup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unsubscribe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own email_threads" ON public.email_threads;
CREATE POLICY "Users manage own email_threads" ON public.email_threads
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own campaign_sequences" ON public.campaign_sequences;
CREATE POLICY "Users manage own campaign_sequences" ON public.campaign_sequences
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own campaign_followup_settings" ON public.campaign_followup_settings;
CREATE POLICY "Users manage own campaign_followup_settings" ON public.campaign_followup_settings
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own ai_generations" ON public.ai_generations;
CREATE POLICY "Users manage own ai_generations" ON public.ai_generations
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own unsubscribe_events" ON public.unsubscribe_events;
CREATE POLICY "Users manage own unsubscribe_events" ON public.unsubscribe_events
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own followup_queue" ON public.followup_queue;
CREATE POLICY "Users manage own followup_queue" ON public.followup_queue
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 14. Functions: Thread Management ───────────────────────────────────────

-- Create or get email thread
CREATE OR REPLACE FUNCTION public.get_or_create_thread(
  p_user_id UUID,
  p_lead_id UUID,
  p_campaign_id UUID,
  p_subject TEXT,
  p_message_id TEXT
) RETURNS UUID AS $$
DECLARE
  v_thread_id UUID;
  v_internal_thread_id TEXT;
BEGIN
  -- Check if thread already exists for this lead + campaign
  SELECT id INTO v_thread_id
  FROM public.email_threads
  WHERE lead_id = p_lead_id
    AND campaign_id = p_campaign_id
    AND user_id = p_user_id;
  
  IF v_thread_id IS NULL THEN
    -- Generate internal thread ID
    v_internal_thread_id := 'thread_' || gen_random_uuid()::text;
    
    -- Create new thread
    INSERT INTO public.email_threads (
      user_id, lead_id, campaign_id, thread_id, subject,
      initial_message_id, first_sent_at, total_sent
    ) VALUES (
      p_user_id, p_lead_id, p_campaign_id, v_internal_thread_id,
      p_subject, p_message_id, NOW(), 1
    ) RETURNING id INTO v_thread_id;
  ELSE
    -- Update existing thread
    UPDATE public.email_threads
    SET total_sent = total_sent + 1,
        last_sent_at = NOW(),
        updated_at = NOW()
    WHERE id = v_thread_id;
  END IF;
  
  RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stop follow-ups for thread
CREATE OR REPLACE FUNCTION public.stop_followups_for_thread(
  p_thread_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
BEGIN
  -- Update thread status
  UPDATE public.email_threads
  SET status = CASE
    WHEN p_reason = 'replied' THEN 'replied'
    WHEN p_reason = 'bounced' THEN 'bounced'
    WHEN p_reason = 'unsubscribed' THEN 'unsubscribed'
    ELSE 'completed'
  END,
  replied_at = CASE WHEN p_reason = 'replied' THEN NOW() ELSE replied_at END,
  updated_at = NOW()
  WHERE id = p_thread_id;
  
  -- Cancel pending follow-ups
  UPDATE public.followup_queue
  SET status = 'cancelled',
      skip_reason = p_reason,
      updated_at = NOW()
  WHERE thread_id = p_thread_id
    AND status = 'pending';
  
  -- Update lead
  UPDATE public.leads l
  SET followup_stopped = true,
      stop_reason = p_reason,
      updated_at = NOW()
  FROM public.email_threads t
  WHERE t.id = p_thread_id AND l.id = t.lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 15. Enhanced Followup Due View ──────────────────────────────────────────
DROP VIEW IF EXISTS public.followup_due;
CREATE OR REPLACE VIEW public.followup_due AS
SELECT
  fq.id AS queue_id,
  fq.user_id,
  fq.thread_id,
  fq.sent_email_id,
  fq.lead_id,
  fq.campaign_id,
  fq.sequence_id,
  fq.followup_number,
  fq.scheduled_at,
  fq.subject,
  fq.body,
  fq.ai_generated,
  fq.style,
  fq.generation_context,
  
  -- Lead data
  l.email AS lead_email,
  l.company_name,
  l.niche,
  l.location,
  l.company_context,
  l.status AS lead_status,
  l.open_count AS lead_opens,
  l.click_count AS lead_clicks,
  l.followup_stopped,
  
  -- Thread data
  et.thread_id AS email_thread_id,
  et.initial_message_id,
  et.status AS thread_status,
  
  -- Original email
  se.subject AS original_subject,
  se.body AS original_body,
  se.sent_at AS original_sent_at,
  COALESCE(se.message_id, se.smtp_message_id) AS original_message_id,
  se.references_header AS original_references,
  
  -- Settings
  cfs.ai_enabled,
  cfs.your_company,
  cfs.your_service,
  cfs.value_proposition,
  cfs.max_followups,
  cfs.stop_on_reply
  
FROM public.followup_queue fq
JOIN public.leads l ON l.id = fq.lead_id
JOIN public.email_threads et ON et.id = fq.thread_id
JOIN public.sent_emails se ON se.id = fq.sent_email_id
LEFT JOIN public.campaign_followup_settings cfs 
  ON cfs.campaign_id = fq.campaign_id

WHERE
  fq.status = 'pending'
  AND fq.scheduled_at <= NOW()
  AND l.followup_stopped = false
  AND et.status = 'active'
  AND l.email IS NOT NULL;

-- ── 16. Campaign Analytics View ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.campaign_analytics AS
SELECT
  se.campaign_id,
  se.user_id,
  COUNT(DISTINCT se.id) FILTER (WHERE NOT se.is_followup) AS emails_sent,
  COUNT(DISTINCT se.id) FILTER (WHERE se.is_followup) AS followups_sent,
  COUNT(DISTINCT se.id) FILTER (WHERE se.opened_at IS NOT NULL) AS total_opened,
  COUNT(DISTINCT se.id) FILTER (WHERE se.clicked_at IS NOT NULL) AS total_clicked,
  COUNT(DISTINCT se.id) FILTER (WHERE se.replied_at IS NOT NULL) AS total_replied,
  COUNT(DISTINCT se.id) FILTER (WHERE se.status = 'bounced') AS total_bounced,
  COUNT(DISTINCT se.id) FILTER (WHERE se.unsubscribed_at IS NOT NULL) AS total_unsubscribed,
  
  -- Averages
  ROUND(AVG(se.followup_number) FILTER (WHERE se.is_followup), 1) AS avg_followup_number,
  
  -- Rates
  ROUND(
    COUNT(DISTINCT se.id) FILTER (WHERE se.opened_at IS NOT NULL)::numeric /
    NULLIF(COUNT(DISTINCT se.id) FILTER (WHERE NOT se.is_followup), 0) * 100, 1
  ) AS open_rate,
  ROUND(
    COUNT(DISTINCT se.id) FILTER (WHERE se.replied_at IS NOT NULL)::numeric /
    NULLIF(COUNT(DISTINCT se.id), 0) * 100, 1
  ) AS reply_rate,
  ROUND(
    COUNT(DISTINCT se.id) FILTER (WHERE se.status = 'bounced')::numeric /
    NULLIF(COUNT(DISTINCT se.id), 0) * 100, 1
  ) AS bounce_rate

FROM public.sent_emails se
GROUP BY se.campaign_id, se.user_id;

-- ── 17. Realtime publications ────────────────────────────────────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_queue;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
