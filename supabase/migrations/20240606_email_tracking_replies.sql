-- Add email tracking and reply detection tables

-- Add reply tracking fields to sent_emails
ALTER TABLE public.sent_emails 
ADD COLUMN IF NOT EXISTS reply_body TEXT,
ADD COLUMN IF NOT EXISTS reply_from TEXT,
ADD COLUMN IF NOT EXISTS smtp_message_id TEXT,
ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
ADD COLUMN IF NOT EXISTS thread_id TEXT;

-- Create email replies table for tracking all replies
CREATE TABLE IF NOT EXISTS public.email_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sent_email_id UUID REFERENCES public.sent_emails(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  is_positive BOOLEAN,
  sentiment TEXT, -- positive, neutral, negative, interested, not_interested
  ai_response_generated BOOLEAN DEFAULT false,
  ai_response_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create AI generated replies table
CREATE TABLE IF NOT EXISTS public.ai_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reply_id UUID REFERENCES public.email_replies(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  tone TEXT,
  model_used TEXT,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft', -- draft, approved, sent, rejected
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email inbox monitoring table (for IMAP/Gmail API integration)
CREATE TABLE IF NOT EXISTS public.email_inbox_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_address TEXT NOT NULL,
  provider TEXT NOT NULL, -- gmail, outlook, imap
  access_token TEXT,
  refresh_token TEXT,
  imap_host TEXT,
  imap_port INTEGER,
  imap_username TEXT,
  imap_password TEXT,
  last_checked_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  auto_reply_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, email_address)
);

-- Create email automation rules table
CREATE TABLE IF NOT EXISTS public.email_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- reply_received, positive_reply, negative_reply, no_reply_after_days
  trigger_condition JSONB, -- additional conditions
  action_type TEXT NOT NULL, -- send_ai_reply, update_crm_status, create_task, send_notification
  action_config JSONB, -- action configuration
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create CRM automation log
CREATE TABLE IF NOT EXISTS public.crm_automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.email_automation_rules(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  details JSONB,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'email_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_replies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'ai_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_replies;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_replies_lead_id ON public.email_replies(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_sent_email_id ON public.email_replies(sent_email_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_received_at ON public.email_replies(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_replies_reply_id ON public.ai_replies(reply_id);
CREATE INDEX IF NOT EXISTS idx_ai_replies_status ON public.ai_replies(status);
CREATE INDEX IF NOT EXISTS idx_crm_automation_log_lead_id ON public.crm_automation_log(lead_id);

-- Create function to auto-update CRM status on reply
CREATE OR REPLACE FUNCTION auto_update_lead_status_on_reply()
RETURNS TRIGGER AS $$
BEGIN
  -- Update lead status to "Replied" when a reply is received
  UPDATE public.leads
  SET 
    status = 'Replied',
    updated_at = NOW()
  WHERE id = NEW.lead_id;
  
  -- Log the automation
  INSERT INTO public.crm_automation_log (
    user_id,
    lead_id,
    action_type,
    old_status,
    new_status,
    details
  )
  SELECT 
    l.user_id,
    l.id,
    'auto_status_update',
    l.status,
    'Replied',
    jsonb_build_object(
      'trigger', 'email_reply_received',
      'reply_id', NEW.id,
      'sentiment', NEW.sentiment
    )
  FROM public.leads l
  WHERE l.id = NEW.lead_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto CRM update
DROP TRIGGER IF EXISTS trigger_auto_update_lead_on_reply ON public.email_replies;
CREATE TRIGGER trigger_auto_update_lead_on_reply
  AFTER INSERT ON public.email_replies
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_lead_status_on_reply();

-- Create function to update sent_email status on reply
CREATE OR REPLACE FUNCTION update_sent_email_on_reply()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.sent_emails
  SET 
    replied_at = NEW.received_at,
    status = 'replied',
    reply_body = NEW.body,
    reply_from = NEW.from_email
  WHERE id = NEW.sent_email_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sent_email update
DROP TRIGGER IF EXISTS trigger_update_sent_email_on_reply ON public.email_replies;
CREATE TRIGGER trigger_update_sent_email_on_reply
  AFTER INSERT ON public.email_replies
  FOR EACH ROW
  EXECUTE FUNCTION update_sent_email_on_reply();
