-- ================================================================
-- MIGRATION: Add custom_pryro_sentence + make profile fields optional
-- Run this once in Supabase SQL Editor.
-- ================================================================

-- 1. Add custom_pryro_sentence column (if not already there)
ALTER TABLE public.sender_profiles
  ADD COLUMN IF NOT EXISTS custom_pryro_sentence TEXT;

-- 2. Make previously-required fields nullable / optional
--    (they were NOT NULL DEFAULT '' — keep the default so old rows are unaffected)
ALTER TABLE public.sender_profiles
  ALTER COLUMN job_title    DROP NOT NULL,
  ALTER COLUMN company_name DROP NOT NULL,
  ALTER COLUMN phone        DROP NOT NULL;

-- 3. Recreate the is_complete generated column to only require full_name
--    (drop the old one first — GENERATED ALWAYS columns can't be altered in place)
ALTER TABLE public.sender_profiles DROP COLUMN IF EXISTS is_complete;

ALTER TABLE public.sender_profiles
  ADD COLUMN is_complete BOOLEAN GENERATED ALWAYS AS (
    full_name IS NOT NULL AND full_name <> ''
  ) STORED;
