# 🚀 AI-Powered Follow-Up System - Complete Implementation

## Production-Ready Cold Email Automation Platform

This is a **complete, production-ready** AI-powered follow-up system for cold email outreach, comparable to **Lemlist**, **Instantly**, **Smartlead**, and **Apollo**.

---

## ✨ Features

### ✅ Core Features

- **Unlimited Follow-Up Sequences** - No limits on number of follow-ups
- **AI-Generated Content** - Smart, context-aware follow-ups using OpenAI, Anthropic, Groq, Gemini, or Mistral
- **SMTP Email Threading** - RFC-compliant Message-ID, In-Reply-To, References headers
- **Automatic Reply Detection** - IMAP scanning with AI classification
- **Smart Decision Engine** - AI chooses follow-up style based on engagement signals
- **Business-Day Scheduling** - Send only on weekdays within defined windows
- **Random Delays** - Anti-spam timing randomization
- **Auto-Stop Conditions** - Stop on reply, bounce, or unsubscribe
- **Rate Limiting** - Per-account daily limits with rotation
- **Complete Analytics** - Open rates, reply rates, engagement tracking
- **Lead Timeline** - Full activity history per lead
- **Retry Logic** - Automatic retry on temporary failures

### ✅ AI Capabilities

- **8 Follow-Up Styles** - Professional, casual, friendly, soft reminder, value-focused, direct, final bump, breakup
- **Reply Classification** - Interested, not interested, meeting request, unsubscribe, auto-reply, neutral
- **Engagement Analysis** - Opens, clicks, reply history influence generation
- **Multi-Provider Support** - OpenAI, Anthropic, Groq, Gemini, Mistral
- **Template Fallback** - Works without AI provider configured

### ✅ Email Threading

- **Message-ID Tracking** - Every email gets unique ID
- **In-Reply-To Headers** - Follow-ups reference original email
- **References Headers** - Full thread chain
- **Gmail/Outlook Compatible** - Follow-ups appear in same conversation

### ✅ Reply Detection

- **IMAP Scanner** - Automatic inbox monitoring
- **Thread Matching** - Message-ID and References matching
- **Auto-Reply Detection** - Filters out OOO messages
- **Bounce Detection** - Identifies delivery failures
- **AI Classification** - Sentiment and intent analysis
- **Auto-Stop** - Stops follow-ups when reply received

---

## 📁 File Structure

```
.
├── supabase/
│   └── migrations/
│       └── 20240620_advanced_followup_system.sql    # Complete database schema
│
├── src/
│   ├── utils/
│   │   ├── ai-followup-generator.ts                 # AI generation + classification
│   │   ├── imap-reply-detector.ts                   # IMAP inbox scanner
│   │   ├── followup-processor.ts                    # Follow-up engine
│   │   ├── send-email-with-followups.ts            # Enhanced email sender
│   │   ├── smtp-server.ts                           # SMTP manager (enhanced)
│   │   └── smtp-manager.ts                          # SMTP utilities
│   │
│   └── app/
│       └── api/
│           ├── cron/
│           │   ├── process-followups/route.ts       # Background processor
│           │   └── scan-inbox/route.ts              # Reply scanner
│           │
│           └── followup/
│               ├── generate/route.ts                # AI generation API
│               ├── trigger/route.ts                 # Manual trigger
│               ├── stop/route.ts                    # Stop automation
│               ├── pause/route.ts                   # Pause/resume
│               └── timeline/route.ts                # Lead timeline
│
├── scripts/
│   └── setup-followup-system.sql                    # Quick setup script
│
├── vercel.json                                       # Cron configuration
├── FOLLOW_UP_SYSTEM_COMPLETE.md                     # Complete guide
├── API_FOLLOW_UP_DOCUMENTATION.md                   # API reference
└── README_FOLLOWUP_COMPLETE.md                      # This file
```

---

## 🚀 Quick Start

### 1. Install Dependencies

Already installed:
- ✅ `nodemailer` - SMTP sending
- ✅ `imapflow` - IMAP inbox scanning
- ✅ `uuid` - Thread ID generation
- ✅ Next.js 16+ with App Router
- ✅ Supabase client

### 2. Run Database Migration

Open Supabase SQL Editor and run:

```sql
-- File: supabase/migrations/20240620_advanced_followup_system.sql
```

This creates:
- 10 new tables
- 2 enhanced views
- 5 database functions
- 15+ indexes
- Complete RLS policies

### 3. Set Environment Variables

Add to `.env.local`:

```bash
# Generate secure secret
CRON_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# Already configured:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_KEY=...
```

### 4. Run Setup Script

```sql
-- File: scripts/setup-followup-system.sql
-- Replace YOUR_USER_ID_HERE with your actual user ID
-- Replace CAMPAIGN_ID_HERE with generated campaign ID
```

This configures:
- Follow-up settings
- Sample campaign
- 5 follow-up sequences
- Default styles and timing

### 5. Deploy to Vercel

```bash
vercel deploy
```

Cron jobs will start automatically:
- Process follow-ups: every 10 minutes
- Scan inbox: every 5 minutes

### 6. Test System

```typescript
import { sendEmailWithFollowUps } from "@/utils/send-email-with-followups";

const result = await sendEmailWithFollowUps({
  userId: "your-user-id",
  leadId: "lead-id",
  campaignId: "campaign-id",
  toEmail: "prospect@company.com",
  subject: "Quick question",
  body: "Hi there...",
  scheduleFollowups: true,  // ← Enable auto-followups
});

console.log(result.followupsScheduled); // 5
```

---

## 📊 Database Schema

### New Tables

| Table | Purpose |
|-------|---------|
| `email_threads` | Thread management with Message-ID |
| `campaign_sequences` | Unlimited follow-up sequences |
| `campaign_followup_settings` | Per-campaign configuration |
| `followup_queue` | Scheduled follow-ups with status |
| `ai_generations` | AI generation log |
| `unsubscribe_events` | Unsubscribe tracking |

### Enhanced Tables

| Table | New Columns |
|-------|-------------|
| `sent_emails` | `message_id`, `references_header`, `email_thread_id`, `followup_number`, `is_followup`, `ai_generated`, `style` |
| `email_replies` | `thread_id`, `message_id`, `is_auto_reply`, `ai_classification`, `ai_confidence` |
| `leads` | `followup_count`, `last_followup_at`, `next_followup_at`, `followup_stopped`, `interest_score` |
| `email_inbox_config` | `last_uid`, `emails_scanned`, `replies_found`, `error_count` |

### Views

| View | Purpose |
|------|---------|
| `followup_due` | All follow-ups ready to be sent |
| `campaign_analytics` | Performance metrics per campaign |

### Functions

| Function | Purpose |
|----------|---------|
| `get_or_create_thread()` | Thread management |
| `stop_followups_for_thread()` | Auto-stop logic |

---

## 🎯 How It Works

### 1. Email Sent with Threading

```typescript
// Send initial email
const result = await sendEmailWithFollowUps({
  ...emailData,
  scheduleFollowups: true
});

// Creates:
// - email_thread record
// - sent_email with message_id
// - 5 entries in followup_queue
```

### 2. Follow-Ups Scheduled

```sql
-- followup_queue entries
| followup_number | scheduled_at         | status  | style          |
|-----------------|---------------------|---------|----------------|
| 1               | 2024-06-23 10:00:00 | pending | friendly       |
| 2               | 2024-06-27 10:00:00 | pending | value_focused  |
| 3               | 2024-07-04 10:00:00 | pending | direct         |
| 4               | 2024-07-11 10:00:00 | pending | final_bump     |
| 5               | 2024-07-20 10:00:00 | pending | breakup        |
```

### 3. Cron Processes Queue

Every 10 minutes:
1. Fetch from `followup_due` view
2. Generate AI content if needed
3. Send via SMTP with threading headers
4. Update thread, lead, queue
5. Schedule next follow-up

### 4. Reply Detection

Every 5 minutes:
1. Connect to IMAP inbox
2. Scan for new messages
3. Match via Message-ID
4. Classify with AI
5. Auto-stop if positive reply
6. Update lead status

### 5. Smart AI Decision

```typescript
// AI automatically chooses style based on:
- 3+ opens → value_focused
- Clicked link → direct
- No engagement → friendly → casual → value_focused
- 4th follow-up → final_bump
- 5th+ follow-up → breakup
```

---

## 📡 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/followup/generate` | POST | Generate AI follow-up |
| `/api/followup/trigger` | POST | Trigger immediately |
| `/api/followup/stop` | POST | Stop automation |
| `/api/followup/pause` | POST | Pause temporarily |
| `/api/followup/timeline` | GET | Lead activity timeline |
| `/api/cron/process-followups` | GET/POST | Background processor (cron) |
| `/api/cron/scan-inbox` | GET/POST | Reply scanner (cron) |

Full API docs: `API_FOLLOW_UP_DOCUMENTATION.md`

---

## 🎨 AI Follow-Up Styles

| Style | Use Case | Example |
|-------|----------|---------|
| **professional** | Default, confident tone | "Following up on my previous email..." |
| **casual** | Second follow-up, relaxed | "Hey, just bumping this up..." |
| **friendly** | First follow-up, warm | "I wanted to check back after..." |
| **soft_reminder** | One open, gentle nudge | "I know things get busy..." |
| **value_focused** | 3+ opens or 3rd follow-up | "Businesses like yours save 10 hours/week..." |
| **direct** | Clicked link, high intent | "One question: is this on your radar?" |
| **final_bump** | 4th follow-up | "One last note before I stop..." |
| **breakup** | 5th+ follow-up, highest reply rate | "I've sent a few emails... I'll stop reaching out." |

---

## 🔧 Configuration Examples

### Example 1: Aggressive 7-Day Sequence

```typescript
const sequences = [
  { sequence_number: 1, delay_days: 1, style: "friendly" },
  { sequence_number: 2, delay_days: 3, style: "value_focused" },
  { sequence_number: 3, delay_days: 7, style: "breakup" },
];
```

### Example 2: Gentle 30-Day Sequence

```typescript
const sequences = [
  { sequence_number: 1, delay_days: 7, style: "soft_reminder" },
  { sequence_number: 2, delay_days: 14, style: "friendly" },
  { sequence_number: 3, delay_days: 30, style: "breakup" },
];
```

### Example 3: Value-First Approach

```typescript
const sequences = [
  { sequence_number: 1, delay_days: 3, style: "value_focused" },
  { sequence_number: 2, delay_days: 7, style: "value_focused" },
  { sequence_number: 3, delay_days: 14, style: "direct" },
  { sequence_number: 4, delay_days: 21, style: "breakup" },
];
```

---

## 📊 Analytics

### Campaign Performance

```typescript
const { data } = await supabase
  .from("campaign_analytics")
  .select("*")
  .eq("user_id", userId);

// Returns:
// - emails_sent, followups_sent
// - total_opened, total_clicked, total_replied
// - open_rate, reply_rate, bounce_rate
// - avg_followup_number
```

### Lead Timeline

```typescript
const res = await fetch(`/api/followup/timeline?leadId=${leadId}`);
const { timeline, summary } = await res.json();

// timeline = chronological events:
// - initial_email_sent
// - opened
// - clicked
// - followup_sent
// - reply_received
// - followup_scheduled
```

### AI Generation Log

```sql
SELECT 
  type,
  model_used,
  decision_reason,
  style,
  created_at
FROM ai_generations
WHERE user_id = 'your-id'
ORDER BY created_at DESC;
```

---

## 🛡️ Safety Features

### Deliverability

✅ **Rate Limiting**
- Per-account daily limits
- Automatic rotation
- Real-time capacity checks

✅ **Anti-Spam Timing**
- Random delays (0-60 min)
- Business hours only
- Weekend skipping

✅ **Sending Windows**
- Configurable start/end times
- Timezone support
- Business-day filtering

### Auto-Stop Conditions

✅ **Stop on reply** - Any reply stops automation
✅ **Stop on bounce** - Hard bounces stop immediately
✅ **Stop on unsubscribe** - Unsubscribe requests honored
✅ **Manual stop** - User can stop anytime

### Error Handling

✅ **Retry logic** - 3 automatic retries
✅ **Error logging** - All failures logged
✅ **Account health** - Tracks SMTP issues
✅ **Graceful degradation** - Falls back to templates if AI fails

---

## 🐛 Troubleshooting

### Follow-ups not sending?

```sql
-- Check queue status
SELECT status, COUNT(*) 
FROM followup_queue 
WHERE user_id = 'your-id'
GROUP BY status;

-- Check SMTP capacity
SELECT email, sent_today, daily_limit, status
FROM smtp_accounts
WHERE user_id = 'your-id' OR is_shared = true;

-- Check cron logs in Vercel dashboard
```

### Replies not detected?

```sql
-- Check IMAP config
SELECT 
  email_address,
  last_checked_at,
  emails_scanned,
  replies_found,
  last_error
FROM email_inbox_config
WHERE user_id = 'your-id';

-- Test IMAP credentials manually
```

### AI not generating?

```sql
-- Check AI provider config
SELECT provider, active_model, created_at
FROM ai_providers
WHERE user_id = 'your-id' AND is_active = true;

-- Check generation log
SELECT model_used, status, created_at
FROM ai_generations
WHERE user_id = 'your-id'
ORDER BY created_at DESC
LIMIT 10;

-- System falls back to templates automatically
```

---

## 📚 Documentation

| File | Description |
|------|-------------|
| `FOLLOW_UP_SYSTEM_COMPLETE.md` | Complete implementation guide |
| `API_FOLLOW_UP_DOCUMENTATION.md` | API reference with examples |
| `README_FOLLOWUP_COMPLETE.md` | This file - overview & quick start |
| `scripts/setup-followup-system.sql` | Quick setup script |

---

## 🎉 What You Get

### ✅ Production-Ready

- Complete database schema with indexes
- Efficient queue-based processing
- RLS security policies
- Error handling & retry logic
- Rate limiting & deliverability
- Monitoring & analytics

### ✅ Feature-Complete

- Unlimited follow-up sequences ✅
- AI-generated content ✅
- SMTP email threading ✅
- Automatic reply detection ✅
- Smart automation rules ✅
- Lead timeline tracking ✅
- Campaign analytics ✅

### ✅ Scalable Architecture

- Queue-based processing
- Background cron jobs
- Batch operations
- Efficient database indexes
- Serverless-ready

### ✅ Comparable to SaaS Tools

| Feature | Lemlist | Instantly | Smartlead | **This System** |
|---------|---------|-----------|-----------|-----------------|
| Unlimited follow-ups | ✅ | ✅ | ✅ | ✅ |
| AI generation | ✅ | ✅ | ✅ | ✅ |
| Email threading | ✅ | ✅ | ✅ | ✅ |
| Reply detection | ✅ | ✅ | ✅ | ✅ |
| Smart automation | ✅ | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ✅ | ✅ |
| Monthly cost | $99+ | $37+ | $49+ | **$0** (your infra) |
| Full control | ❌ | ❌ | ❌ | ✅ |
| Self-hosted | ❌ | ❌ | ❌ | ✅ |

---

## 🚀 Next Steps

1. ✅ Run database migration
2. ✅ Set `CRON_SECRET` environment variable
3. ✅ Run setup script
4. ✅ Configure SMTP accounts
5. ✅ (Optional) Configure IMAP inbox
6. ✅ Deploy to Vercel
7. ✅ Send test email with `scheduleFollowups: true`
8. ✅ Monitor queue: `SELECT * FROM followup_queue`
9. ✅ Check timeline: `/api/followup/timeline?leadId=xxx`
10. ✅ Build frontend UI components

---

## 💡 Pro Tips

### For Best Results

1. **Start conservative** - 3-4 follow-ups, 7-14 day spacing
2. **Use AI styles** - Let decision engine choose based on engagement
3. **Monitor reply rates** - Adjust sequences based on data
4. **A/B test** - Try different sequences per campaign
5. **Clean your list** - Remove bounces and unsubscribes
6. **Warm up accounts** - Gradually increase sending volume

### For Scale

1. **Add SMTP accounts** - More accounts = higher daily capacity
2. **Use multiple campaigns** - Different sequences for different audiences
3. **Monitor queue size** - If queue grows, increase cron frequency
4. **Optimize sending windows** - Match recipient timezones
5. **Use business days only** - Better open rates

---

## 📞 Support & Issues

If you encounter issues:

1. Check Supabase SQL logs
2. Check Vercel cron logs
3. Check `followup_queue.error_message`
4. Check `email_inbox_config.last_error`
5. Check `ai_generations` for AI failures

Common solutions:
- IMAP auth failed → Use app password (Gmail)
- SMTP rate limits → Add more accounts
- Follow-ups not sending → Check cron is running
- AI not generating → Check API key, system falls back to templates

---

## 🎊 You're Done!

You now have a **production-ready, AI-powered follow-up system** that rivals $99/month SaaS tools.

**What's included:**
- ✅ Complete backend implementation
- ✅ Database schema with indexes
- ✅ SMTP threading (RFC-compliant)
- ✅ IMAP reply detection
- ✅ AI-powered automation
- ✅ Queue-based processing
- ✅ Complete API
- ✅ Analytics & tracking

**Deploy, configure, and start sending!** 🚀

---

**Questions?** Check the documentation:
- Complete guide: `FOLLOW_UP_SYSTEM_COMPLETE.md`
- API reference: `API_FOLLOW_UP_DOCUMENTATION.md`
- Setup script: `scripts/setup-followup-system.sql`
