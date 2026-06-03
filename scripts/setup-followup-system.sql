-- ============================================================
-- QUICK SETUP SCRIPT FOR FOLLOW-UP SYSTEM
-- Run this after running the main migration
-- ============================================================

-- Get your user ID first
-- SELECT id, email FROM auth.users;

-- Replace 'YOUR_USER_ID_HERE' with your actual user ID from above query

-- ── 1. Enable Auto-Follow-Ups ────────────────────────────────────────────────
INSERT INTO public.followup_settings (
  user_id,
  auto_followup_enabled,
  default_delay_days,
  max_followups,
  stop_on_reply,
  followup_tone,
  your_company,
  your_service
) VALUES (
  'YOUR_USER_ID_HERE'::uuid,
  true,
  3,
  5,
  true,
  'professional',
  'Your Company Name',
  'Your Service/Product Description'
) ON CONFLICT (user_id) DO UPDATE SET
  auto_followup_enabled = true,
  your_company = EXCLUDED.your_company,
  your_service = EXCLUDED.your_service;

-- ── 2. Create Sample Campaign ─────────────────────────────────────────────────
INSERT INTO public.email_campaigns (
  id,
  user_id,
  name,
  description,
  niche,
  status
) VALUES (
  gen_random_uuid(),
  'YOUR_USER_ID_HERE'::uuid,
  'Default Outreach Campaign',
  'Automated follow-up campaign with AI generation',
  'General B2B',
  'active'
) ON CONFLICT DO NOTHING;

-- Get the campaign ID for next steps
-- SELECT id, name FROM email_campaigns WHERE user_id = 'YOUR_USER_ID_HERE'::uuid;

-- ── 3. Configure Campaign Follow-Up Settings ──────────────────────────────────
-- Replace 'CAMPAIGN_ID_HERE' with the campaign ID from above
INSERT INTO public.campaign_followup_settings (
  campaign_id,
  user_id,
  enabled,
  max_followups,
  stop_on_reply,
  stop_on_auto_reply,
  stop_on_bounce,
  stop_on_unsubscribe,
  ai_enabled,
  default_style,
  your_company,
  your_service,
  value_proposition
) VALUES (
  'CAMPAIGN_ID_HERE'::uuid,
  'YOUR_USER_ID_HERE'::uuid,
  true,
  5,
  true,
  false,
  true,
  true,
  true,
  'professional',
  'Your Company Name',
  'Your Service',
  'We help businesses save time and increase revenue through automation'
);

-- ── 4. Create Follow-Up Sequences ─────────────────────────────────────────────
-- Day 3 - Friendly follow-up
INSERT INTO public.campaign_sequences (
  campaign_id,
  user_id,
  sequence_number,
  name,
  delay_days,
  delay_hours,
  business_days_only,
  send_window_start,
  send_window_end,
  timezone,
  random_delay_minutes,
  ai_generate,
  style,
  is_active
) VALUES (
  'CAMPAIGN_ID_HERE'::uuid,
  'YOUR_USER_ID_HERE'::uuid,
  1,
  'Follow-Up #1 - Friendly',
  3,
  0,
  true,
  '09:00',
  '17:00',
  'UTC',
  30,
  true,
  'friendly',
  true
);

-- Day 7 - Value-focused
INSERT INTO public.campaign_sequences (
  campaign_id,
  user_id,
  sequence_number,
  name,
  delay_days,
  delay_hours,
  business_days_only,
  send_window_start,
  send_window_end,
  timezone,
  random_delay_minutes,
  ai_generate,
  style,
  is_active
) VALUES (
  'CAMPAIGN_ID_HERE'::uuid,
  'YOUR_USER_ID_HERE'::uuid,
  2,
  'Follow-Up #2 - Value',
  7,
  0,
  true,
  '09:00',
  '17:00',
  'UTC',
  45,
  true,
  'value_focused',
  true
);

-- Day 14 - Direct CTA
INSERT INTO public.campaign_sequences (
  campaign_id,
  user_id,
  sequence_number,
  name,
  delay_days,
  delay_hours,
  business_days_only,
  send_window_start,
  send_window_end,
  timezone,
  random_delay_minutes,
  ai_generate,
  style,
  is_active
) VALUES (
  'CAMPAIGN_ID_HERE'::uuid,
  'YOUR_USER_ID_HERE'::uuid,
  3,
  'Follow-Up #3 - Direct',
  14,
  0,
  true,
  '10:00',
  '16:00',
  'UTC',
  60,
  true,
  'direct',
  true
);

-- Day 21 - Final bump
INSERT INTO public.campaign_sequences (
  campaign_id,
  user_id,
  sequence_number,
  name,
  delay_days,
  delay_hours,
  business_days_only,
  send_window_start,
  send_window_end,
  timezone,
  random_delay_minutes,
  ai_generate,
  style,
  is_active
) VALUES (
  'CAMPAIGN_ID_HERE'::uuid,
  'YOUR_USER_ID_HERE'::uuid,
  4,
  'Follow-Up #4 - Final Bump',
  21,
  0,
  true,
  '10:00',
  '16:00',
  'UTC',
  30,
  true,
  'final_bump',
  true
);

-- Day 30 - Breakup email
INSERT INTO public.campaign_sequences (
  campaign_id,
  user_id,
  sequence_number,
  name,
  delay_days,
  delay_hours,
  business_days_only,
  send_window_start,
  send_window_end,
  timezone,
  random_delay_minutes,
  ai_generate,
  style,
  is_active
) VALUES (
  'CAMPAIGN_ID_HERE'::uuid,
  'YOUR_USER_ID_HERE'::uuid,
  5,
  'Follow-Up #5 - Breakup',
  30,
  0,
  true,
  '11:00',
  '15:00',
  'UTC',
  20,
  true,
  'breakup',
  true
);

-- ── 5. (Optional) Configure IMAP Inbox ───────────────────────────────────────
-- For Gmail, generate app password at: https://myaccount.google.com/apppasswords
/*
INSERT INTO public.email_inbox_config (
  user_id,
  email_address,
  provider,
  imap_host,
  imap_port,
  imap_username,
  imap_password,
  inbox_folder,
  scan_interval_minutes,
  is_active,
  auto_reply_enabled
) VALUES (
  'YOUR_USER_ID_HERE'::uuid,
  'your@email.com',
  'gmail',
  'imap.gmail.com',
  993,
  'your@email.com',
  'your-app-password-here',
  'INBOX',
  5,
  true,
  false
);
*/

-- ── 6. Verify Setup ───────────────────────────────────────────────────────────
-- Check followup settings
SELECT * FROM public.followup_settings WHERE user_id = 'YOUR_USER_ID_HERE'::uuid;

-- Check campaign
SELECT * FROM public.email_campaigns WHERE user_id = 'YOUR_USER_ID_HERE'::uuid;

-- Check campaign settings
SELECT * FROM public.campaign_followup_settings WHERE user_id = 'YOUR_USER_ID_HERE'::uuid;

-- Check sequences
SELECT 
  sequence_number,
  name,
  delay_days,
  style,
  is_active
FROM public.campaign_sequences 
WHERE user_id = 'YOUR_USER_ID_HERE'::uuid
ORDER BY sequence_number;

-- Check SMTP accounts (must have at least one)
SELECT 
  email,
  host,
  sent_today,
  daily_limit,
  status
FROM public.smtp_accounts 
WHERE user_id = 'YOUR_USER_ID_HERE'::uuid OR is_shared = true;

-- ── 7. Test Query - Check what emails are due for follow-up ──────────────────
SELECT 
  queue_id,
  lead_email,
  company_name,
  followup_number,
  scheduled_at,
  original_subject
FROM public.followup_due
WHERE user_id = 'YOUR_USER_ID_HERE'::uuid
ORDER BY scheduled_at
LIMIT 10;

-- ============================================================
-- DONE! Your follow-up system is configured.
--
-- Next steps:
-- 1. Send an email using the campaign_id from step 2
-- 2. Follow-ups will be auto-scheduled
-- 3. Monitor with: SELECT * FROM followup_queue WHERE user_id = 'YOUR_USER_ID_HERE'::uuid;
-- 4. Deploy to Vercel to enable automatic processing
-- ============================================================
