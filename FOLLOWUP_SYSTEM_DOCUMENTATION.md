# Complete AI-Powered Follow-Up System Documentation

## Overview

This is a **production-ready, scalable cold email follow-up system** similar to Lemlist, Instantly, Smartlead, and Apollo. It includes:

✅ **Unlimited automated follow-up sequences**  
✅ **AI-generated follow-up emails** with smart decision engine  
✅ **SMTP email threading** (Message-ID, In-Reply-To, References)  
✅ **Automatic reply detection** via IMAP inbox polling  
✅ **Smart AI-powered reply classification** (interested/not_interested/meeting_request/unsubscribe/auto_reply)  
✅ **Complete lead timeline tracking** (all emails, opens, clicks, replies, AI generations)  
✅ **Follow-up analytics dashboard** (performance by FU number, daily trends, AI stats)  
✅ **Automated sequence stopping** (on reply, bounce, unsubscribe)  
✅ **Business-day & sending window support**  
✅ **Vercel Cron integration** (runs every hour)  
✅ **60-account SMTP rotation** (shared + personal accounts)

---

## Architecture

### Database Schema (New Tables & Columns)

Run `FOLLOWUP_SYSTEM_UPGRADE.sql` in Supabase SQL Editor to add:

#### New Tables:
- **`ai_followup_generations`** — Stores all AI-generated follow-up drafts with decision reasoning
- **`unsubscribe_events`** — Tracks all unsubscribe requests (from replies or links)
- **`lead_notes`** — User notes on leads visible in timeline

#### Extended Tables:
- **`sent_emails`** — Added threading columns: `smtp_message_id`, `in_reply_to`, `references_header`, `thread_id`, `is_followup`, `parent_sent_email_id`, `ai_generated`
- **`email_replies`** — Added AI classification: `classification`, `is_auto_reply`, `is_unsubscribe`, `message_id`, `raw_headers`
- **`followup_settings`** — Added advanced options: `sending_window_start`, `sending_window_end`, `business_days_only`, `random_delay_minutes`, `use_ai_generation`, `ai_followup_style`
- **`leads`** — Added follow-up tracking: `followup_count`, `last_followup_at`, `is_unsubscribed`, `open_count`, `click_count`

#### Views:
- **`followup_due`** — Updated to include threading info, engagement signals, AI settings

#### Triggers:
- **`unsubscribe_reply_trigger`** — Auto-stops follow-ups when unsubscribe detected
- **`email_open_count_trigger`** — Increments `open_count`/`click_count` on leads

---

## API Routes

### 1. `/api/followup/generate` (POST)
**AI Follow-Up Generator**

Generates personalized follow-up email using:
- Smart decision engine (picks style based on opens/clicks)
- Lead engagement signals
- Previous follow-up history
- AI provider (OpenAI/Groq/Anthropic/Gemini/Mistral) or template fallback

**Request:**
```json
{
  "sentEmailId": "uuid",
  "style": "professional",  // optional override
  "save": true
}
```

**Response:**
```json
{
  "success": true,
  "generation": {
    "id": "uuid",
    "subject": "Re: Original subject",
    "body": "AI-generated follow-up email...",
    "style": "value_focused",
    "decisionReason": "Lead opened 4 times — showing interest. Value-focused CTA.",
    "modelUsed": "gpt-4o-mini",
    "followupNumber": 2
  }
}
```

**Styles:**
- `professional` — Default professional tone
- `casual` — Conversational, short sentences
- `friendly` — Warm and approachable
- `soft_reminder` — Very gentle, no pressure
- `value_focused` — Leads with specific benefit/metric
- `direct` — Crisp, clear CTA
- `final_bump` — Low-pressure last attempt
- `breakup` — "This is my last email" (highest reply rate)

---

### 2. `/api/followup/timeline` (GET)
**Lead Activity Timeline**

Returns complete activity history for a lead.

**Query:** `?leadId=uuid`

**Response:**
```json
{
  "success": true,
  "lead": { /* lead object */ },
  "events": [
    {
      "id": "sent-uuid",
      "type": "email_sent",
      "timestamp": "2024-01-15T10:00:00Z",
      "title": "Initial email sent",
      "description": "Subject line here",
      "metadata": { /* full email data */ }
    },
    {
      "type": "email_opened",
      "timestamp": "2024-01-15T14:23:00Z",
      "title": "Email opened"
    },
    {
      "type": "reply_received",
      "timestamp": "2024-01-16T09:12:00Z",
      "title": "Reply received (interested)",
      "metadata": { "classification": "interested", "isPositive": true }
    }
  ],
  "stats": {
    "totalEmails": 1,
    "totalFollowups": 2,
    "totalOpens": 4,
    "totalClicks": 1,
    "totalReplies": 1,
    "positiveReplies": 1,
    "aiGenerations": 2
  }
}
```

**Event Types:**
- `email_sent` / `followup_sent`
- `email_opened` / `email_clicked` / `email_bounced`
- `reply_received` / `auto_reply` / `unsubscribe`
- `ai_generated` / `ai_followup_sent`
- `unsubscribed`
- `note`

---

### 3. `/api/followup/analytics` (GET)
**Follow-Up Performance Analytics**

Comprehensive stats across all follow-ups.

**Query:** `?days=30&campaignId=uuid` (optional filters)

**Response:**
```json
{
  "success": true,
  "period": { "days": 30, "since": "2024-01-01T00:00:00Z" },
  "overview": {
    "totalSent": 1234,
    "totalFollowupsSent": 456,
    "totalOpened": 567,
    "totalReplied": 89,
    "openRate": 45.9,
    "replyRate": 7.2,
    "aiGeneratedCount": 234
  },
  "sequencePerformance": [
    { "followupNumber": 0, "label": "Initial Email", "sent": 500, "replied": 35, "replyRate": 7.0 },
    { "followupNumber": 1, "label": "Follow-up #1", "sent": 300, "replied": 21, "replyRate": 7.0 },
    { "followupNumber": 2, "label": "Follow-up #2", "sent": 180, "replied": 15, "replyRate": 8.3 },
    { "followupNumber": 3, "label": "Follow-up #3", "sent": 100, "replied": 12, "replyRate": 12.0 }
  ],
  "replies": {
    "total": 89,
    "positive": 67,
    "classifications": {
      "interested": 34,
      "meeting_request": 23,
      "not_interested": 12,
      "neutral": 20
    }
  },
  "dailyTrend": [
    { "date": "2024-01-15", "sent": 45, "opened": 23, "replied": 3, "followups": 12 }
  ],
  "aiStats": {
    "total": 234,
    "used": 189,
    "byStyle": { "professional": 45, "value_focused": 78, "breakup": 23 },
    "byModel": { "gpt-4o-mini": 123, "llama-3.3-70b-versatile": 66 }
  }
}
```

---

### 4. `/api/followup/process` (POST/GET)
**Follow-Up Scheduler Engine**

Processes all due follow-ups. Called by:
1. **Vercel Cron** every hour (with `Authorization: Bearer <CRON_SECRET>` header)
2. **Manual trigger** from UI (authenticated user session)

**What it does:**
1. Queries `followup_due` view for emails due right now
2. For each email:
   - Checks if lead replied/unsubscribed (skip if true)
   - Generates AI follow-up OR uses template
   - Sends via SMTP with **threading headers** (In-Reply-To, References)
   - Logs to `sent_emails`, `followup_queue`, `ai_followup_generations`
   - Increments `followup_count` on lead
   - Schedules next follow-up date

**SMTP Threading:**
Every follow-up email includes:
- `In-Reply-To:` → Original email's Message-ID
- `References:` → Chain of all previous Message-IDs
- Result: Follow-ups appear in the same Gmail/Outlook conversation thread

---

### 5. `/api/followup/trigger` (POST)
**Manual Follow-Up Trigger**

Schedules `next_followup_at` for specific sent emails, then optionally runs processor.

**Request:**
```json
{
  "sentEmailIds": ["uuid1", "uuid2"],  // optional — scope to specific emails
  "runNow": true  // default true — immediately run processor
}
```

---

### 6. `/api/inbox/check` (POST/GET)
**IMAP Reply Polling**

Connects to user's IMAP inbox, fetches new emails, matches them to `sent_emails`, stores in `email_replies`.

Called by:
- **Vercel Cron** every 15 minutes
- **"Check Inbox" button** in UI

**What it does:**
1. Fetches new emails from inbox since `last_checked_at`
2. Matches replies via:
   - `In-Reply-To` header (most reliable)
   - Subject line matching (strips Re:/Fwd:)
   - Sender email address (looks up lead)
3. **AI Reply Classification:**
   - `interested` / `not_interested`
   - `meeting_request` / `unsubscribe`
   - `auto_reply` (out-of-office detected)
   - `positive` / `negative` / `neutral`
4. Auto-stops follow-ups if `stop_on_reply = true` and reply detected
5. Creates notification for positive replies

**Auto-Reply Detection:**
Pattern-based detection of out-of-office messages. Sets `is_auto_reply = true` and **does NOT stop follow-ups** (these aren't real replies).

**Unsubscribe Detection:**
Detects "unsubscribe", "remove me", "stop emailing" phrases. Triggers:
- Updates `leads.is_unsubscribed = true`
- Stops all follow-ups for this lead
- Logs to `unsubscribe_events`

---

## Smart Decision Engine

The AI follow-up generator uses engagement signals to pick the best style:

### Decision Logic:

| Condition | Style | Reasoning |
|-----------|-------|-----------|
| Lead opened 3+ times | `value_focused` | High interest → lead with specific benefit |
| Lead clicked a link | `direct` | High intent → conversion-focused CTA |
| 1 open, 1st FU | `soft_reminder` | Gentle nudge |
| 1st FU, no engagement | `friendly` | Warm up the conversation |
| 2nd FU | `casual` | Stand out with relaxed tone |
| 3rd FU | `value_focused` | Different angle — emphasize value |
| 4th FU | `final_bump` | Low-pressure last attempt |
| 5th+ FU | `breakup` | "This is my last email" (highest reply rate) |

**Why this works:**
- Matches the lead's behavior pattern
- Avoids "same email 5 times" syndrome
- Breakup emails get 2-3x higher reply rates than generic follow-ups

---

## SMTP Threading Implementation

### Problem:
Standard SMTP sends create **new email threads** for every follow-up → clutters inbox, looks unprofessional.

### Solution:
RFC 5322-compliant threading headers.

**On initial send:**
```
Message-ID: <abc123@domain.com>
```

**On follow-up #1:**
```
Message-ID: <def456@domain.com>
In-Reply-To: <abc123@domain.com>
References: <abc123@domain.com>
```

**On follow-up #2:**
```
Message-ID: <ghi789@domain.com>
In-Reply-To: <abc123@domain.com>
References: <abc123@domain.com> <def456@domain.com>
```

**Result:** All emails appear in the **same conversation thread** in Gmail/Outlook/Apple Mail.

### Database Storage:
- `sent_emails.smtp_message_id` — The Message-ID generated when sending
- `sent_emails.thread_id` — Persistent thread identifier (same for all emails in sequence)
- `sent_emails.in_reply_to` — Parent email's Message-ID
- `sent_emails.references_header` — Full chain of Message-IDs
- `sent_emails.parent_sent_email_id` — Links to the original `sent_emails` row

### Code (`src/utils/smtp-server.ts`):
```typescript
sendEmail(to, subject, html, text, threadingOptions?: {
  inReplyTo?: string;
  references?: string;
})
```

---

## AI Generation System

### How it Works:

1. **Smart Decision Engine** analyzes:
   - How many times lead opened emails
   - If they clicked any links
   - How many follow-ups already sent
   - Lead status

2. **Picks optimal style** (professional/casual/value_focused/breakup)

3. **Builds context:**
   ```typescript
   {
     companyName: "Acme Corp",
     niche: "Healthcare",
     originalSubject: "ERP for clinics",
     originalBody: "...",
     followupNumber: 2,
     openCount: 4,    // ← Key signal
     clickCount: 1,   // ← Key signal
     yourCompany: "Pryro",
     yourService: "ERP system"
   }
   ```

4. **Calls AI provider** (OpenAI/Groq/Anthropic/Gemini/Mistral) with:
   - System prompt: "You are a sales rep writing follow-up #2 in 'value_focused' style. Keep it under 120 words."
   - User prompt: All context + previous follow-ups

5. **Falls back to template** if no AI provider configured

### Example Output:
```
SUBJECT: What Acme Corp could save with Pryro

BODY:
Hi Acme Corp team,

I noticed you opened my previous email a few times — figured you might be interested.

Healthcare providers typically save 10-12 hours per week after switching to Pryro. That's mostly from eliminating manual reconciliation between billing, inventory, and HR systems.

Worth a 10-minute call to see if the numbers make sense for Acme?

Best,
Sales Team
```

### Decision Reason Logged:
```
"Lead opened 4 times — showing interest. Value-focused CTA."
```

---

## Cron Jobs (Vercel)

### Setup:

1. **Add `vercel.json`** (already created):
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

2. **Generate `CRON_SECRET`:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. **Add to Vercel Environment Variables:**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add `CRON_SECRET` = your generated string

4. **Update `.env.local`:**
```env
CRON_SECRET=your_secure_random_string_here
```

### How Cron Auth Works:

```typescript
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;
const isCronCall = cronSecret && authHeader === `Bearer ${cronSecret}`;

if (!isCronCall) {
  // Must be authenticated user
  const { user } = await supabase.auth.getUser();
  if (!user) return 401;
}
```

---

## Follow-Up Settings

Users configure follow-up behavior via `followup_settings` table.

### Settings UI (to be built):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `auto_followup_enabled` | Boolean | `false` | Master on/off switch |
| `max_followups` | Integer | `5` | Maximum follow-ups per lead (1-10) |
| `default_delay_days` | Integer | `3` | Days between follow-ups (1-30) |
| `stop_on_reply` | Boolean | `true` | Stop sequence if lead replies |
| `followup_tone` | String | `professional` | Template tone (professional/casual/friendly) |
| `use_ai_generation` | Boolean | `false` | Enable AI-powered follow-ups |
| `ai_followup_style` | String | `professional` | Default AI style (overridden by decision engine) |
| `your_company` | String | — | Your company name for templates |
| `your_service` | String | — | Your service description |
| `business_days_only` | Boolean | `true` | Skip weekends |
| `sending_window_start` | Integer | `8` | Start sending at 8 AM |
| `sending_window_end` | Integer | `18` | Stop sending at 6 PM |
| `random_delay_minutes` | Integer | `15` | Add 0-15 min random delay |

---

## Stop Conditions

Follow-ups **automatically stop** when:

1. **Lead replied** (`stop_on_reply = true` and reply detected)
2. **Lead unsubscribed** (`is_unsubscribed = true`)
3. **Email bounced** (hard bounce detected)
4. **Lead status = Replied/Interested/Closed/Dead**
5. **Max follow-ups reached** (`followup_count >= max_followups`)
6. **Lead has no email address**
7. **Manual stop** (user cancels via UI)

**Does NOT stop for:**
- Auto-replies (out-of-office) — these aren't real replies
- Opens/clicks — these are engagement signals, not replies

---

## Lead Status Tracking

### Status Flow:
```
New → contacted (email sent) → opened (pixel fired) → clicked (link clicked)
   → replied (reply detected) → interested (positive reply)
   → bounced / failed / unsubscribed / invalid_email
```

### Auto-Updates:
- **Email sent:** `status = contacted`, `last_contacted_at = NOW()`
- **Email opened:** `status = opened`, `open_count++`
- **Email clicked:** `status = clicked`, `click_count++`
- **Reply received:** `status = replied`, stops follow-ups
- **Positive reply:** `status = interested`
- **Unsubscribe reply:** `status = unsubscribed`, `is_unsubscribed = true`
- **Hard bounce:** `status = bounced`, `email_verified = false`

---

## Analytics & Reporting

### Key Metrics:

**Overall Performance:**
- Total sent / Total follow-ups sent
- Open rate / Click rate / Reply rate / Bounce rate
- AI-generated vs template emails

**Sequence Performance:**
- Reply rate per follow-up number (FU #1, FU #2, etc.)
- Optimal number of follow-ups (where reply rate peaks)
- Which styles perform best

**AI Stats:**
- Total AI generations
- Usage by style (professional/casual/breakup)
- Usage by model (GPT-4/Llama/Claude)
- How many AI-generated emails were actually sent

**Reply Classification:**
- Interested / Not interested / Neutral
- Meeting requests
- Unsubscribes
- Auto-replies (ignored)

### Charts (to be built in UI):
- Daily trend: Sent / Opened / Replied / Follow-ups
- Sequence funnel: Initial → FU #1 → FU #2 → FU #3 → FU #4
- Reply classification pie chart
- AI style performance comparison

---

## Testing Guide

### 1. Run Database Migration
```sql
-- In Supabase SQL Editor:
-- Paste and run FOLLOWUP_SYSTEM_UPGRADE.sql
```

### 2. Enable Follow-Ups for Your Account
```sql
-- Manual insert (replace user_id):
INSERT INTO followup_settings (user_id, auto_followup_enabled, max_followups, default_delay_days, use_ai_generation)
VALUES ('your-user-id-here', true, 5, 3, true);
```

### 3. Test AI Generation
```bash
curl -X POST http://localhost:3000/api/followup/generate \
  -H "Content-Type: application/json" \
  -d '{ "sentEmailId": "existing-sent-email-id" }'
```

### 4. Test Manual Trigger
```bash
curl -X POST http://localhost:3000/api/followup/trigger \
  -H "Content-Type: application/json" \
  -d '{ "runNow": true }'
```

### 5. Test Cron (Locally)
```bash
curl -X POST http://localhost:3000/api/followup/process \
  -H "Authorization: Bearer your_cron_secret_here"
```

### 6. Verify Threading
Send an initial email → send a follow-up → check Gmail/Outlook to confirm both appear in same thread.

---

## Production Checklist

- [ ] Run `FOLLOWUP_SYSTEM_UPGRADE.sql` in Supabase
- [ ] Generate and add `CRON_SECRET` to Vercel env vars
- [ ] Deploy `vercel.json` (cron config)
- [ ] Configure AI provider (OpenAI/Groq/etc.) in AI Settings
- [ ] Enable auto-followup in Follow-Up Settings
- [ ] Set up IMAP inbox config for reply detection
- [ ] Test end-to-end: Send email → Wait 3 days → Verify follow-up sent
- [ ] Monitor Vercel Cron logs (Deployments → Functions → Cron)
- [ ] Set up Supabase RLS policies (already in migration)
- [ ] Enable Supabase Realtime (already in migration)

---

## Troubleshooting

### "Follow-ups not sending"
1. Check `followup_settings.auto_followup_enabled = true`
2. Check `sent_emails.next_followup_at` is in the past
3. Check `sent_emails.followup_stopped = false`
4. Check Vercel Cron logs for errors
5. Manually trigger: `POST /api/followup/trigger`

### "Threading not working"
1. Verify `sent_emails.smtp_message_id` is populated
2. Check `sent_emails.in_reply_to` and `references_header` on follow-ups
3. Test with Gmail (best threading support)

### "AI generation failing"
1. Check AI provider API key is valid
2. Check `ai_providers.is_active = true`
3. Falls back to templates if AI fails (check logs)

### "Replies not detected"
1. Check IMAP config (`email_inbox_config`)
2. Manually trigger: `POST /api/inbox/check`
3. Check inbox last_checked_at timestamp
4. Verify imapflow is installed: `npm install imapflow`

### "Cron not running"
1. Verify `CRON_SECRET` env var in Vercel
2. Check `vercel.json` is deployed
3. View logs: Vercel Dashboard → Deployments → Functions

---

## Next Steps

### Recommended UI Additions:
1. **Follow-Up Settings Panel** — Edit `followup_settings` from UI
2. **Lead Timeline View** — Use `/api/followup/timeline` to show activity
3. **Analytics Dashboard** — Charts using `/api/followup/analytics`
4. **AI Generation Preview** — "Generate & Preview" button before sending
5. **Follow-Up Queue Manager** — View/cancel pending follow-ups
6. **Reply Inbox** — Dedicated view for `email_replies` with classification badges

### Advanced Features:
- A/B testing follow-up styles
- Lead scoring based on engagement
- Automated lead enrichment on reply
- Webhook integrations (Slack/Zapier notifications)
- Multi-language follow-ups
- Conditional follow-up paths (different sequences for openers vs non-openers)

---

## Support & Maintenance

### Monitoring:
- **Supabase Dashboard** → Database → `sent_emails` / `followup_queue`
- **Vercel Dashboard** → Functions → Cron logs
- **Follow-Up Analytics API** → Daily review

### Common Maintenance:
- Weekly: Review failed follow-ups in `followup_queue` where `status = 'failed'`
- Monthly: Analyze sequence performance → adjust `max_followups`
- Quarterly: Review AI generation quality → tune prompts

---

**Built with:** Next.js 16, Supabase, Vercel, Nodemailer, IMAP, OpenAI/Groq/Anthropic/Gemini/Mistral APIs

**License:** Proprietary

**Version:** 1.0.0 (February 2025)
