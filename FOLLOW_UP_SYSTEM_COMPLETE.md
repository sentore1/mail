# 🚀 Production-Ready AI Follow-Up System

## Complete Implementation Guide

This is a **production-ready AI-powered follow-up system** for your cold email outreach platform. It supports unlimited follow-ups, SMTP threading, reply detection, smart automation, and advanced analytics.

---

## ✅ What's Included

### 1. **Database Schema** (Complete)
- ✅ `email_threads` - Thread management with Message-ID tracking
- ✅ `campaign_sequences` - Unlimited follow-up sequences per campaign
- ✅ `campaign_followup_settings` - Per-campaign configuration
- ✅ `followup_queue` - Scheduled follow-ups with status tracking
- ✅ `ai_generations` - AI generation log and analytics
- ✅ `unsubscribe_events` - Unsubscribe tracking
- ✅ Enhanced `sent_emails` with threading headers
- ✅ Enhanced `email_replies` with classification
- ✅ Enhanced `leads` with follow-up status
- ✅ Views: `followup_due`, `campaign_analytics`
- ✅ Functions: Thread management, auto-stop logic
- ✅ Indexes for performance
- ✅ RLS policies for security

### 2. **Core Services** (Complete)
- ✅ `imap-reply-detector.ts` - IMAP inbox scanner
- ✅ `followup-processor.ts` - Follow-up engine
- ✅ `ai-followup-generator.ts` - AI generation (already exists, enhanced)
- ✅ `smtp-server.ts` - SMTP with threading support (already exists)

### 3. **API Routes** (Complete)
- ✅ `/api/cron/process-followups` - Background processor
- ✅ `/api/cron/scan-inbox` - Reply detection
- ✅ `/api/followup/generate` - AI generation
- ✅ `/api/followup/trigger` - Manual trigger
- ✅ `/api/followup/stop` - Stop automation
- ✅ `/api/followup/pause` - Pause/resume
- ✅ `/api/followup/timeline` - Lead timeline

### 4. **SMTP Threading** (Complete)
- ✅ Message-ID storage
- ✅ In-Reply-To header
- ✅ References header
- ✅ Thread preservation across Gmail/Outlook
- ✅ RFC-compliant headers

### 5. **Reply Detection** (Complete)
- ✅ IMAP connection
- ✅ Message-ID matching
- ✅ Thread matching
- ✅ Auto-reply detection
- ✅ Bounce detection
- ✅ AI classification
- ✅ Auto-stop on reply

### 6. **AI Features** (Complete)
- ✅ Smart decision engine
- ✅ 8 follow-up styles
- ✅ Context-aware generation
- ✅ Engagement signals
- ✅ Reply classification
- ✅ Multi-provider support (OpenAI, Anthropic, Groq, Gemini, Mistral)

### 7. **Automation** (Complete)
- ✅ Unlimited sequences
- ✅ Business-day scheduling
- ✅ Sending windows
- ✅ Random delays
- ✅ Stop conditions
- ✅ Retry logic
- ✅ Rate limiting

---

## 📦 Installation Steps

### Step 1: Run Database Migration

Run the new migration in your Supabase SQL Editor:

```bash
supabase/migrations/20240620_advanced_followup_system.sql
```

This creates all tables, views, functions, and indexes.

### Step 2: Set Up Environment Variables

Add to your `.env.local`:

```bash
# Cron job secret (generate a random string)
CRON_SECRET=your_secure_random_string_here_replace_me

# Already have these:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_KEY=...
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Configure Vercel Cron

The `vercel.json` file is already configured:
- Process follow-ups: every 10 minutes
- Scan inbox: every 5 minutes

Deploy to Vercel and the cron jobs will run automatically.

### Step 4: Configure IMAP Inbox (Optional)

If you want automatic reply detection, configure your inbox:

```sql
INSERT INTO email_inbox_config (
  user_id,
  email_address,
  imap_host,
  imap_port,
  imap_username,
  imap_password,
  is_active
) VALUES (
  'your-user-id',
  'your@email.com',
  'imap.gmail.com',  -- or your IMAP server
  993,
  'your@email.com',
  'your-app-password',
  true
);
```

**Gmail users:** Generate an App Password at https://myaccount.google.com/apppasswords

---

## 🎯 How It Works

### Email Flow

1. **Initial Email Sent**
   - User sends cold email via `/api/send-email`
   - System creates `email_thread` record
   - Stores Message-ID for threading
   - Schedules follow-ups based on campaign sequences

2. **Follow-Ups Scheduled**
   - Entries added to `followup_queue` table
   - Each has `scheduled_at` timestamp
   - Status: `pending`

3. **Cron Processes Queue**
   - Every 10 minutes: `/api/cron/process-followups`
   - Fetches due follow-ups from `followup_due` view
   - Generates AI content if needed
   - Sends via SMTP with threading headers
   - Updates thread, lead, queue

4. **Reply Detection**
   - Every 5 minutes: `/api/cron/scan-inbox`
   - Scans IMAP inbox for new messages
   - Matches replies to sent emails via Message-ID
   - Classifies with AI
   - Auto-stops follow-ups if positive reply
   - Updates lead status

5. **Smart Automation**
   - AI decides follow-up style based on engagement
   - Opened 3+ times → value-focused
   - Clicked link → direct CTA
   - No engagement → casual/friendly
   - 5+ follow-ups → breakup email

---

## 🔧 Usage Examples

### Create a Campaign with Follow-Ups

```typescript
// 1. Create campaign
const { data: campaign } = await supabase
  .from("email_campaigns")
  .insert({ name: "Q1 Outreach", user_id: userId })
  .select()
  .single();

// 2. Configure follow-up settings
await supabase.from("campaign_followup_settings").insert({
  campaign_id: campaign.id,
  user_id: userId,
  enabled: true,
  max_followups: 5,
  stop_on_reply: true,
  ai_enabled: true,
  default_style: "professional",
  your_company: "Acme Corp",
  your_service: "AI-powered CRM",
});

// 3. Create follow-up sequences
const sequences = [
  { sequence_number: 1, delay_days: 3, style: "friendly" },
  { sequence_number: 2, delay_days: 7, style: "value_focused" },
  { sequence_number: 3, delay_days: 14, style: "direct" },
  { sequence_number: 4, delay_days: 21, style: "final_bump" },
  { sequence_number: 5, delay_days: 30, style: "breakup" },
];

for (const seq of sequences) {
  await supabase.from("campaign_sequences").insert({
    campaign_id: campaign.id,
    user_id: userId,
    ...seq,
    business_days_only: true,
    send_window_start: "09:00",
    send_window_end: "17:00",
    random_delay_minutes: 30,
    ai_generate: true,
  });
}
```

### Send Email with Auto Follow-Ups

```typescript
// Updated send-email route (add to existing)
import { scheduleFollowUps } from "@/utils/followup-processor";

// After sending email successfully:
const threadId = await supabase.rpc("get_or_create_thread", {
  p_user_id: userId,
  p_lead_id: leadId,
  p_campaign_id: campaignId,
  p_subject: subject,
  p_message_id: messageId,
});

// Schedule follow-ups
await scheduleFollowUps(
  userId,
  sentEmailId,
  threadId,
  leadId,
  campaignId,
  messageId
);
```

### Generate AI Follow-Up Manually

```typescript
const response = await fetch("/api/followup/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sentEmailId: "xxx",
    leadId: "yyy",
    followupNumber: 2,
    style: "casual", // optional override
  }),
});

const { subject, body, style, modelUsed, decisionReason } = await response.json();
```

### Get Lead Timeline

```typescript
const response = await fetch(`/api/followup/timeline?leadId=${leadId}`);
const { timeline, summary } = await response.json();

// timeline = [
//   { type: "initial_email_sent", timestamp: "...", subject: "..." },
//   { type: "opened", timestamp: "...", emailSubject: "..." },
//   { type: "followup_sent", timestamp: "...", followupNumber: 1 },
//   { type: "reply_received", timestamp: "...", classification: "interested" },
// ]
```

### Stop Follow-Ups for Lead

```typescript
await fetch("/api/followup/stop", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    leadId: "xxx",
    reason: "not_interested",
  }),
});
```

---

## 📊 Analytics & Tracking

### Campaign Performance View

```sql
SELECT * FROM campaign_analytics WHERE user_id = 'your-user-id';
```

Returns:
- `emails_sent`, `followups_sent`
- `total_opened`, `total_clicked`, `total_replied`
- `open_rate`, `reply_rate`, `bounce_rate`
- `avg_followup_number`

### Lead Status Tracking

Enhanced `leads` table now includes:
- `followup_count` - Total follow-ups sent
- `last_followup_at` - Last follow-up timestamp
- `next_followup_at` - Next scheduled follow-up
- `followup_stopped` - Automation stopped?
- `stop_reason` - Why stopped (replied, bounced, etc.)
- `open_count`, `click_count`, `reply_count`
- `interest_score` - AI-calculated score

---

## 🎨 AI Follow-Up Styles

### 1. **Professional** (Default)
- Confident and direct
- References previous email naturally
- Clear CTA

### 2. **Casual**
- Conversational and relaxed
- Short sentences
- Like bumping into someone

### 3. **Friendly**
- Warm and approachable
- Shows genuine interest
- Relationship-focused

### 4. **Soft Reminder**
- Very gentle bump
- Acknowledges they're busy
- No pressure

### 5. **Value-Focused**
- Leads with specific benefit
- Concrete results or metrics
- Problem-solution framing

### 6. **Direct**
- Crisp and to the point
- Clear CTA for call/demo
- No fluff

### 7. **Final Bump**
- Low-pressure final nudge
- Easy to say yes OR no
- No guilt

### 8. **Breakup**
- Polite "last email" notice
- 2-3 sentences max
- Paradoxically highest reply rate

---

## 🛡️ Safety & Deliverability

### Built-in Protections

✅ **Rate Limiting**
- Per-account daily limits
- Hourly limits (optional)
- Account rotation

✅ **Random Delays**
- Configurable per sequence
- Anti-spam timing
- Human-like patterns

✅ **Business Hours**
- Sending windows
- Weekend skipping
- Timezone support

✅ **Stop Conditions**
- Auto-stop on reply
- Auto-stop on bounce
- Auto-stop on unsubscribe
- Manual stop

✅ **Error Handling**
- Retry logic (3 attempts)
- Error logging
- Account health tracking

✅ **Duplicate Prevention**
- Thread deduplication
- Queue deduplication
- Reply deduplication

---

## 🔍 Monitoring & Debugging

### Check Follow-Up Queue Status

```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(scheduled_at) as next_due
FROM followup_queue
WHERE user_id = 'your-user-id'
GROUP BY status;
```

### View AI Generation Log

```sql
SELECT 
  type,
  model_used,
  decision_reason,
  created_at
FROM ai_generations
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC
LIMIT 20;
```

### Check IMAP Scan Status

```sql
SELECT 
  email_address,
  last_checked_at,
  emails_scanned,
  replies_found,
  last_error
FROM email_inbox_config
WHERE user_id = 'your-user-id';
```

---

## 🚀 Next Steps

### 1. Test the System

```bash
# 1. Run database migration
# 2. Set CRON_SECRET env var
# 3. Deploy to Vercel
# 4. Test cron endpoints manually:

curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/process-followups

curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/scan-inbox
```

### 2. Integrate with UI

You'll need to build frontend components:
- Campaign sequence builder
- Follow-up settings form
- Lead timeline view
- Reply inbox
- Analytics dashboard

### 3. Optional Enhancements

- Gmail API instead of IMAP (faster, more reliable)
- Webhook for instant reply detection
- A/B testing for follow-up styles
- Personalization variables
- Template library
- Warm-up scheduler

---

## 📞 Support

If you encounter issues:

1. Check Supabase logs
2. Check Vercel cron logs
3. Check `followup_queue.error_message`
4. Check `email_inbox_config.last_error`

Common issues:
- IMAP auth failed → Check app password
- SMTP rate limits → Add more accounts
- Follow-ups not sending → Check cron is running
- Replies not detected → Check IMAP config

---

## ✨ Production-Ready Features

✅ **Scalability**
- Handles 1000s of follow-ups
- Queue-based processing
- Batch operations
- Efficient indexes

✅ **Reliability**
- Retry logic
- Error recovery
- Transaction safety
- Duplicate prevention

✅ **Security**
- RLS policies
- Cron auth
- Env vars for secrets
- SQL injection prevention

✅ **Observability**
- Generation logs
- Error tracking
- Status tracking
- Analytics views

---

## 🎉 Conclusion

This is a **complete, production-ready** follow-up system comparable to Lemlist, Instantly, Smartlead.

**What makes it production-ready:**
- ✅ Complete database schema with indexes
- ✅ Proper SMTP threading (RFC-compliant)
- ✅ IMAP reply detection
- ✅ AI-powered smart automation
- ✅ Queue-based processing
- ✅ Rate limiting & deliverability
- ✅ Error handling & retry logic
- ✅ Security & RLS policies
- ✅ Analytics & tracking
- ✅ Scalable architecture

**You now have:**
- Unlimited follow-up sequences ✅
- AI-generated follow-ups ✅
- SMTP email threading ✅
- Automatic reply detection ✅
- Smart automation rules ✅
- Complete analytics ✅

Deploy, configure your sequences, and start sending! 🚀
