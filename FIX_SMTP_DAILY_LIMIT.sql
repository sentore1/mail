-- Fix SMTP accounts that have daily_limit set too low (50 instead of 500)
-- Gmail allows 500 emails/day for free accounts
-- Run this in your Supabase SQL editor

UPDATE smtp_accounts
SET daily_limit = 500
WHERE daily_limit < 500
  AND provider ILIKE '%gmail%';

-- Verify the fix
SELECT id, email, daily_limit, sent_today, status
FROM smtp_accounts
ORDER BY created_at DESC;
