-- Add last_imap_check column to smtp_accounts
-- This tracks when each SMTP account was last scanned for replies via IMAP
ALTER TABLE public.smtp_accounts
  ADD COLUMN IF NOT EXISTS last_imap_check TIMESTAMPTZ;

-- Verify
SELECT id, email, host, last_imap_check
FROM public.smtp_accounts
LIMIT 5;
