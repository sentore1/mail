-- ================================================================
-- SENDER PROFILE TABLE
-- Run this in Supabase SQL Editor once.
-- Each user has exactly one profile row (upsert on user_id).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.sender_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Required fields
  full_name     TEXT NOT NULL DEFAULT '',
  job_title     TEXT NOT NULL DEFAULT '',
  company_name  TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',

  -- Optional fields
  email         TEXT,
  website       TEXT,
  linkedin_url  TEXT,

  -- Metadata
  is_complete   BOOLEAN GENERATED ALWAYS AS (
    full_name  <> '' AND
    job_title  <> '' AND
    company_name <> '' AND
    phone      <> ''
  ) STORED,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_sender_profiles_user ON public.sender_profiles(user_id);

-- RLS: every user can only see and edit their own row
ALTER TABLE public.sender_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sender_profile" ON public.sender_profiles;
CREATE POLICY "Users manage own sender_profile" ON public.sender_profiles
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION public.touch_sender_profile()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sender_profile_updated ON public.sender_profiles;
CREATE TRIGGER sender_profile_updated
  BEFORE UPDATE ON public.sender_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_sender_profile();
