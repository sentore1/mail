-- Fix SMTP daily limit to 500 (Gmail's actual daily limit for free accounts)
-- Run this in Supabase SQL Editor

UPDATE smtp_accounts 
SET daily_limit = 500 
WHERE daily_limit < 500;

-- Verify the fix
SELECT email, daily_limit, sent_today, status 
FROM smtp_accounts 
ORDER BY created_at DESC;
