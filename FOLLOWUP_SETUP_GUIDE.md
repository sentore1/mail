# Follow-Up System — Quick Setup Guide

## Step 1: Database Migration

1. Open **Supabase Dashboard** → SQL Editor
2. Copy the entire contents of `FOLLOWUP_SYSTEM_UPGRADE.sql`
3. Paste and run it
4. Wait for "Follow-Up System Upgrade complete!" confirmation

This creates all the new tables, columns, triggers, and indexes needed.

---

## Step 2: Configure Cron Secret

### Generate Secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (a long random string).

### Add to Vercel:
1. Go to **Vercel Dashboard** → Your Project → Settings → Environment Variables
2. Click **Add New**
3. Name: `CRON_SECRET`
4. Value: Paste the random string you generated
5. Environment: **Production** (check all options)
6. Click **Save**

### Add to `.env.local`:
```env
CRON_SECRET=your_generated_string_here
```

**Important:** This secret must match in both places!

---

## Step 3: Deploy Cron Configuration

The `vercel.json` file has already been created in your project root with:

```json
{
  "crons": [
    {
      "path": "/api/followup/process",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/inbox/check",
      "schedule": "0 10 * * *"
    }
  ]
}
```

**What this does:**
- `/api/followup/process` — Runs every hour (processes due follow-ups)
- `/api/inbox/check` — Runs every 15 minutes (scans for replies)

**Deploy:**
```bash
git add vercel.json
git commit -m "Add cron configuration"
git push
```

Vercel will automatically detect the cron config and start running the jobs.

---

## Step 4: Enable Follow-Ups for Your Account

### Option A: Via SQL (Manual)
```sql
-- Replace 'your-user-id-here' with your actual Supabase auth user ID
INSERT INTO followup_settings (
  user_id,
  auto_followup_enabled,
  max_followups,
  default_delay_days,
  stop_on_reply,
  use_ai_generation,
  your_company,
  your_service
) VALUES (
  'your-user-id-here',
  true,        -- Enable auto-followup
  5,           -- Max 5 follow-ups
  3,           -- 3 days between each
  true,        -- Stop when reply received
  true,        -- Use AI generation
  'Pryro',
  'ERP system'
);
```

### Option B: Via API (Once UI is built)
```bash
curl -X POST http://localhost:3000/api/followup/settings \
  -H "Content-Type: application/json" \
  -d '{
    "auto_followup_enabled": true,
    "max_followups": 5,
    "default_delay_days": 3,
    "use_ai_generation": true,
    "your_company": "Pryro",
    "your_service": "ERP system"
  }'
```

---

## Step 5: Configure AI Provider (Optional but Recommended)

AI-powered follow-ups require an API key from one of:
- OpenAI (GPT-4o-mini)
- Groq (Llama 3.3 70B — **free**, fastest)
- Anthropic (Claude)
- Google Gemini
- Mistral

### Quick Setup with Groq (Free, Fast):
1. Go to https://console.groq.com
2. Sign up (free)
3. Get API key
4. In your app → **AI Settings** → Add Groq provider → Paste key
5. Set as active

If no AI provider is configured, the system uses **template-based follow-ups** (still works great).

---

## Step 6: Set Up Inbox Reply Detection (Optional)

To automatically detect replies:

1. Go to **Follow-Up** module → **Inbox Setup** tab
2. Add your Gmail IMAP credentials:
   - **Email:** your-email@gmail.com
   - **IMAP Host:** imap.gmail.com
   - **IMAP Port:** 993
   - **Username:** your-email@gmail.com
   - **Password:** Your Gmail App Password (not your regular password!)

### Get Gmail App Password:
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" → "Windows Computer"
3. Click Generate
4. Copy the 16-character password
5. Paste it in the Inbox Setup form

**Note:** Standard Gmail passwords won't work. You MUST use an App Password.

---

## Step 7: Test the System

### Test 1: Send an Initial Email
1. Go to **CRM** → Select a lead
2. Click **Write Email**
3. Send an email

This creates a `sent_emails` row with `followup_count = 0`.

### Test 2: Manually Schedule a Follow-Up
```bash
# Via API:
curl -X POST http://localhost:3000/api/followup/trigger \
  -H "Content-Type: application/json" \
  -d '{ "runNow": true }'
```

Or via SQL:
```sql
-- Set next_followup_at to NOW() so it's immediately due
UPDATE sent_emails 
SET next_followup_at = NOW() 
WHERE id = 'your-sent-email-id';
```

Then trigger the processor:
```bash
curl -X POST http://localhost:3000/api/followup/process \
  -H "Authorization: Bearer your_cron_secret_here"
```

### Test 3: Verify Threading
1. Send initial email to yourself
2. Wait for follow-up to send (or trigger manually)
3. Check your inbox — both emails should be in the **same conversation thread**

If they're separate threads, check:
- `sent_emails.smtp_message_id` is populated
- Follow-up has `in_reply_to` and `references_header`

### Test 4: Test Reply Detection
1. Reply to one of the emails you sent
2. Run inbox check:
```bash
curl -X POST http://localhost:3000/api/followup/inbox/check
```
3. Check `email_replies` table — your reply should appear
4. Check `sent_emails.followup_stopped` — should be `true` (sequence stopped)

---

## Step 8: Monitor Cron Jobs

### View Cron Logs:
1. Go to **Vercel Dashboard** → Your Project → Deployments
2. Click the latest deployment → **Functions** tab
3. Scroll to **Cron Jobs**
4. View execution logs

You should see:
- `/api/followup/process` running every hour
- `/api/inbox/check` running every 15 minutes

### Check for Errors:
If cron jobs fail, common issues:
- Missing `CRON_SECRET` env var
- Database RLS policy blocking service role
- SMTP accounts at daily limit
- AI provider API key invalid

---

## Step 9: Production Checklist

- [x] Database migration complete
- [x] `CRON_SECRET` added to Vercel
- [x] `vercel.json` deployed
- [x] Follow-up settings enabled for your account
- [ ] AI provider configured (optional)
- [ ] IMAP inbox config added (optional)
- [ ] Test email sent with follow-up scheduled
- [ ] Threading verified (follow-ups in same thread)
- [ ] Cron jobs running successfully
- [ ] First automated follow-up sent and verified

---

## Monitoring & Maintenance

### Daily:
- Check Vercel Cron logs for errors
- Review `followup_queue` where `status = 'failed'`

### Weekly:
- Run analytics: `GET /api/followup/analytics?days=7`
- Check reply rate by follow-up number
- Adjust `max_followups` if needed

### Monthly:
- Review AI generation quality
- Check SMTP account health scores
- Analyze which follow-up styles perform best

---

## Troubleshooting

### "No follow-ups sending"
1. Check `followup_settings.auto_followup_enabled = true`
2. Check `sent_emails.next_followup_at` is in the past
3. Manually trigger: `POST /api/followup/trigger`
4. Check Vercel Cron logs

### "Cron not running"
1. Verify `CRON_SECRET` matches in Vercel env vars and `.env.local`
2. Check `vercel.json` is deployed (should be in latest commit)
3. Redeploy: `git push`

### "Threading not working"
1. Check `sent_emails.smtp_message_id` is populated (not null)
2. Check `sent_emails.in_reply_to` on follow-up emails
3. Test with Gmail (best threading support)

### "AI generation not working"
1. Check AI provider is active: `SELECT * FROM ai_providers WHERE user_id = 'your-id' AND is_active = true`
2. Test API key manually (curl to OpenAI/Groq)
3. Check `ai_followup_generations` table for error messages
4. System falls back to templates if AI fails (no error shown)

### "Reply detection not working"
1. Check IMAP config: `SELECT * FROM email_inbox_config WHERE user_id = 'your-id'`
2. Verify `is_active = true` and `last_checked_at` is recent
3. Manually trigger: `POST /api/inbox/check`
4. Check inbox credentials (test IMAP login separately)
5. Ensure `imapflow` is installed: `npm install imapflow`

---

## Getting Help

1. Check **FOLLOWUP_SYSTEM_DOCUMENTATION.md** for detailed technical docs
2. Review Vercel Cron logs for specific error messages
3. Check Supabase Database logs
4. Test each API endpoint individually with curl

---

**Setup Complete!** 🚀

Your platform now has:
✅ Unlimited automated follow-up sequences  
✅ AI-generated follow-ups with smart decision engine  
✅ SMTP email threading (same conversation)  
✅ Automatic reply detection  
✅ Reply classification (interested/not_interested/meeting_request)  
✅ Complete lead timeline tracking  
✅ Follow-up analytics  
✅ Hourly cron processing  

Next: Build the UI components to visualize all this data!
