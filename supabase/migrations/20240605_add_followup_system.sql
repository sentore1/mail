-- Add category and location fields to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create email campaigns table for follow-up sequences
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, paused, completed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email sequences table for follow-up emails
CREATE TABLE IF NOT EXISTS public.email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE CASCADE NOT NULL,
  sequence_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 3,
  subject_template TEXT,
  body_template TEXT,
  tone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sent emails tracking table
CREATE TABLE IF NOT EXISTS public.sent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  status TEXT DEFAULT 'sent' -- sent, opened, replied, bounced
);

-- Create follow-up settings table
CREATE TABLE IF NOT EXISTS public.followup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  auto_followup_enabled BOOLEAN DEFAULT false,
  default_delay_days INTEGER DEFAULT 3,
  max_followups INTEGER DEFAULT 3,
  stop_on_reply BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create categories table for managing lead categories
CREATE TABLE IF NOT EXISTS public.lead_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8B5CF6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Enable Realtime (only if not already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'email_campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_campaigns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'sent_emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sent_emails;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'followup_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_settings;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_leads_category ON public.leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_location ON public.leads(location);
CREATE INDEX IF NOT EXISTS idx_sent_emails_lead_id ON public.sent_emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_campaign_id ON public.sent_emails(campaign_id);
