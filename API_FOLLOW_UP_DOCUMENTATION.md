# 📡 Follow-Up System API Documentation

Complete API reference for the AI-powered follow-up system.

---

## 🔐 Authentication

All API routes require authentication via Supabase session (except cron endpoints).

Cron endpoints require `Authorization: Bearer {CRON_SECRET}` header.

---

## 📮 Endpoints

### 1. Generate AI Follow-Up

**POST** `/api/followup/generate`

Generate an AI-powered follow-up email based on context and engagement signals.

#### Request Body

```typescript
{
  sentEmailId: string;        // ID of original sent email
  leadId: string;            // Lead ID
  followupNumber?: number;   // Follow-up number (default: 1)
  style?: string;            // Override AI style decision
                            // Options: professional, casual, friendly,
                            //          soft_reminder, value_focused, direct,
                            //          final_bump, breakup
  overrideContext?: {        // Override default context
    yourCompany?: string;
    yourService?: string;
    [key: string]: any;
  }
}
```

#### Response

```typescript
{
  success: true,
  subject: string,           // Generated subject line
  body: string,             // Generated email body
  style: string,            // Style used
  modelUsed: string,        // AI model (e.g., "gpt-4o-mini" or "template")
  decisionReason: string,   // Why this style was chosen
  aiDecision: {
    recommended: string,    // AI-recommended style
    reason: string,         // Decision rationale
    followupNumber: number
  }
}
```

#### Example

```bash
curl -X POST https://your-app.com/api/followup/generate \
  -H "Content-Type: application/json" \
  -d '{
    "sentEmailId": "123e4567-e89b-12d3-a456-426614174000",
    "leadId": "987fcdeb-51a2-43d7-9f8e-123456789abc",
    "followupNumber": 2
  }'
```

---

### 2. Trigger Follow-Up Now

**POST** `/api/followup/trigger`

Immediately trigger a scheduled follow-up to be processed.

#### Request Body

```typescript
{
  queueId?: string;  // Specific queue item ID
  leadId?: string;   // Or trigger next followup for lead
}
```

Either `queueId` OR `leadId` is required.

#### Response

```typescript
{
  success: true,
  processed: number,
  sent: number,
  skipped: number,
  failed: number,
  errors: string[]
}
```

---

### 3. Stop Follow-Ups

**POST** `/api/followup/stop`

Stop all pending follow-ups for a lead permanently.

#### Request Body

```typescript
{
  leadId: string;
  reason?: string;  // Default: "manual_stop"
                   // Options: manual_stop, not_interested, wrong_person, etc.
}
```

#### Response

```typescript
{
  success: true
}
```

---

### 4. Pause Follow-Ups

**POST** `/api/followup/pause`

Pause follow-ups temporarily (can be resumed).

#### Request Body

```typescript
{
  leadId: string;
}
```

#### Response

```typescript
{
  success: true,
  paused: number  // Number of follow-ups paused
}
```

---

### 5. Get Lead Timeline

**GET** `/api/followup/timeline?leadId={leadId}`

Get complete activity timeline for a lead.

#### Query Parameters

- `leadId` (required): Lead UUID

#### Response

```typescript
{
  success: true,
  thread: {
    id: string;
    thread_id: string;
    status: string;
    total_sent: number;
    total_opened: number;
    total_clicked: number;
    // ... more thread fields
  },
  timeline: Array<{
    type: "initial_email_sent" | "followup_sent" | "opened" | 
          "clicked" | "reply_received" | "followup_scheduled";
    timestamp: string;
    // Event-specific fields
  }>,
  summary: {
    totalSent: number;
    followupsSent: number;
    totalReplies: number;
    pendingFollowups: number;
    lastActivity: string;
  }
}
```

#### Timeline Event Types

**initial_email_sent**
```typescript
{
  type: "initial_email_sent",
  timestamp: string,
  subject: string,
  opened: boolean,
  clicked: boolean,
  replied: boolean,
  messageId: string
}
```

**followup_sent**
```typescript
{
  type: "followup_sent",
  timestamp: string,
  subject: string,
  followupNumber: number,
  opened: boolean,
  clicked: boolean,
  aiGenerated: boolean,
  style: string
}
```

**opened**
```typescript
{
  type: "opened",
  timestamp: string,
  emailSubject: string
}
```

**clicked**
```typescript
{
  type: "clicked",
  timestamp: string,
  emailSubject: string
}
```

**reply_received**
```typescript
{
  type: "reply_received",
  timestamp: string,
  from: string,
  subject: string,
  body: string,
  isAutoReply: boolean,
  isBounce: boolean,
  classification: string,
  sentiment: string
}
```

**followup_scheduled**
```typescript
{
  type: "followup_scheduled",
  timestamp: string,
  followupNumber: number,
  status: string
}
```

---

### 6. Process Follow-Ups (Cron)

**GET/POST** `/api/cron/process-followups`

Background job to process all due follow-ups across all users.

#### Headers

```
Authorization: Bearer {CRON_SECRET}
```

#### Response

```typescript
{
  success: true,
  users_processed: number,
  processed: number,
  sent: number,
  skipped: number,
  failed: number,
  details: Array<{
    user_id: string,
    processed: number,
    sent: number,
    skipped: number,
    failed: number,
    errors: string[]
  }>
}
```

#### Schedule

Configure in `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/process-followups",
    "schedule": "0 8 * * *"  // Every 10 minutes
  }]
}
```

---

### 7. Scan Inbox (Cron)

**GET/POST** `/api/cron/scan-inbox`

Background job to scan all user inboxes for replies.

#### Headers

```
Authorization: Bearer {CRON_SECRET}
```

#### Response

```typescript
{
  success: true,
  usersScanned: number,
  totalReplies: number,
  details: Array<{
    userId: string,
    totalReplies: number,
    scannedInboxes: number,
    errors: string[]
  }>
}
```

#### Schedule

```json
{
  "path": "/api/cron/scan-inbox",
  "schedule": "0 9 * * *"  // Every 5 minutes
}
```

---

## 🎯 Usage Examples

### Example 1: Send Email with Auto Follow-Ups

```typescript
import { sendEmailWithFollowUps } from "@/utils/send-email-with-followups";

const result = await sendEmailWithFollowUps({
  userId: "user-uuid",
  leadId: "lead-uuid",
  campaignId: "campaign-uuid",
  toEmail: "prospect@company.com",
  subject: "Quick question about {{company_name}}",
  body: "Hi there...",
  scheduleFollowups: true,  // Enable auto-followups
  fromName: "John Doe"
});

console.log(result);
// {
//   success: true,
//   sentEmailId: "...",
//   threadId: "...",
//   messageId: "<...@domain.com>",
//   followupsScheduled: 5,
//   accountUsed: "sender@company.com"
// }
```

### Example 2: Manual Follow-Up Generation

```typescript
// 1. Generate follow-up
const generateRes = await fetch("/api/followup/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sentEmailId: originalEmailId,
    leadId: leadId,
    followupNumber: 2
  })
});

const { subject, body, style } = await generateRes.json();

// 2. Review/edit content

// 3. Send manually via SMTP
// (or save to queue for scheduled sending)
```

### Example 3: Build Custom Sequence

```typescript
// 1. Create campaign
const { data: campaign } = await supabase
  .from("email_campaigns")
  .insert({ name: "Product Launch Outreach", user_id: userId })
  .select()
  .single();

// 2. Configure settings
await supabase.from("campaign_followup_settings").insert({
  campaign_id: campaign.id,
  user_id: userId,
  enabled: true,
  max_followups: 3,
  stop_on_reply: true,
  ai_enabled: true,
  default_style: "professional",
  your_company: "TechCorp",
  your_service: "AI Marketing Platform"
});

// 3. Define sequences
const sequences = [
  {
    sequence_number: 1,
    delay_days: 3,
    style: "friendly",
    ai_generate: true,
    business_days_only: true,
    send_window_start: "09:00",
    send_window_end: "17:00",
    random_delay_minutes: 30
  },
  {
    sequence_number: 2,
    delay_days: 7,
    style: "value_focused",
    subject_template: "Quick question about {{company_name}}",
    body_template: "Hi {{company_name}}...",
    ai_generate: true
  },
  {
    sequence_number: 3,
    delay_days: 14,
    style: "breakup",
    ai_generate: true
  }
];

for (const seq of sequences) {
  await supabase.from("campaign_sequences").insert({
    campaign_id: campaign.id,
    user_id: userId,
    ...seq
  });
}

// 4. Send initial emails (follow-ups auto-schedule)
await sendEmailWithFollowUps({
  userId,
  leadId,
  campaignId: campaign.id,
  toEmail: "prospect@company.com",
  subject: "Partnership opportunity",
  body: "...",
  scheduleFollowups: true
});
```

### Example 4: Monitor Follow-Up Status

```typescript
// Get timeline
const timelineRes = await fetch(`/api/followup/timeline?leadId=${leadId}`);
const { timeline, summary } = await timelineRes.json();

console.log(summary);
// {
//   totalSent: 3,
//   followupsSent: 2,
//   totalReplies: 0,
//   pendingFollowups: 1,
//   lastActivity: "2024-06-20T10:30:00Z"
// }

// Check pending follow-ups
const { data: pending } = await supabase
  .from("followup_queue")
  .select("*")
  .eq("lead_id", leadId)
  .eq("status", "pending")
  .order("scheduled_at");

// Trigger next one immediately
if (pending.length > 0) {
  await fetch("/api/followup/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queueId: pending[0].id })
  });
}
```

### Example 5: Handle Reply Detection

```typescript
// IMAP scanner runs automatically, but you can also:

// 1. Get detected replies
const { data: replies } = await supabase
  .from("email_replies")
  .select("*, leads(*)")
  .eq("user_id", userId)
  .is("ai_response_sent", false)
  .order("received_at", { ascending: false });

// 2. Check classification
for (const reply of replies) {
  console.log({
    from: reply.from_email,
    classification: reply.ai_classification,
    isPositive: reply.is_positive,
    sentiment: reply.sentiment
  });
  
  // Follow-ups are auto-stopped for positive replies
  // You can generate AI response if needed
  if (reply.is_positive) {
    // Generate response
  }
}
```

---

## 🔧 Configuration Reference

### Campaign Sequences Table

```typescript
{
  campaign_id: UUID;
  sequence_number: number;      // 1, 2, 3...
  delay_days: number;           // Days after previous email
  delay_hours?: number;         // Additional hours
  business_days_only: boolean;  // Skip weekends
  send_window_start: string;    // "09:00"
  send_window_end: string;      // "17:00"
  timezone: string;             // "UTC", "America/New_York"
  random_delay_minutes: number; // 0-60
  subject_template?: string;    // Optional template
  body_template?: string;       // Optional template
  ai_generate: boolean;         // Use AI generation
  style: string;                // Follow-up style
  is_active: boolean;           // Enable/disable
}
```

### Follow-Up Styles

```typescript
type FollowUpStyle =
  | "professional"     // Confident, direct, clear CTA
  | "casual"          // Conversational, relaxed
  | "friendly"        // Warm, relationship-focused
  | "soft_reminder"   // Gentle, no pressure
  | "value_focused"   // Lead with benefits/metrics
  | "direct"          // Straight to the point
  | "final_bump"      // Low-pressure last nudge
  | "breakup";        // Polite last email (highest reply rate)
```

### AI Decision Engine

The system automatically chooses style based on:

- **3+ opens** → `value_focused` (showing interest)
- **Clicked link** → `direct` (high intent)
- **1 open, first follow-up** → `soft_reminder`
- **First follow-up, no engagement** → `friendly`
- **Second follow-up** → `casual`
- **Third follow-up** → `value_focused`
- **Fourth follow-up** → `final_bump`
- **5+ follow-ups** → `breakup` (last email)

Override with `style` parameter in generation request.

---

## ⚡ Rate Limits & Constraints

### SMTP Limits

- Per-account daily limits (configured in `smtp_accounts` table)
- Automatic account rotation
- Real-time capacity checking

### Processing Limits

- Cron processes 50 follow-ups per user per run
- 1.5-2.5 second delay between sends
- Max 3 retry attempts on failure

### API Limits

- Standard Supabase RLS applies
- Cron endpoints require secret authentication
- No specific rate limits on other endpoints

---

## 🐛 Error Handling

### Common Errors

**No SMTP accounts available**
```json
{ "success": false, "error": "No SMTP accounts available or all at daily limit" }
```
→ Add more SMTP accounts or wait for daily reset

**Thread not found**
```json
{ "success": false, "error": "Email not found" }
```
→ Ensure email was sent and recorded in `sent_emails`

**IMAP authentication failed**
```json
{ "errors": ["IMAP connection error: Invalid credentials"] }
```
→ Check `email_inbox_config` credentials, use app password for Gmail

**AI generation failed**
```json
{ "modelUsed": "template" }
```
→ AI provider not configured or API key invalid, falls back to templates

---

## 📊 Monitoring Queries

### Check Queue Health

```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(scheduled_at) as next_due
FROM followup_queue
WHERE user_id = 'your-user-id'
GROUP BY status;
```

### Campaign Performance

```sql
SELECT * FROM campaign_analytics
WHERE user_id = 'your-user-id';
```

### Recent AI Generations

```sql
SELECT 
  type,
  model_used,
  decision_reason,
  status,
  created_at
FROM ai_generations
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC
LIMIT 20;
```

### IMAP Scan Status

```sql
SELECT 
  email_address,
  last_checked_at,
  emails_scanned,
  replies_found,
  error_count,
  last_error
FROM email_inbox_config
WHERE user_id = 'your-user-id';
```

---

## 🚀 Quick Start Checklist

- [ ] Run database migration
- [ ] Set `CRON_SECRET` environment variable
- [ ] Configure at least one SMTP account
- [ ] (Optional) Configure IMAP inbox
- [ ] Deploy to Vercel (cron will auto-start)
- [ ] Create campaign with sequences
- [ ] Send first email with `scheduleFollowups: true`
- [ ] Monitor `followup_queue` table
- [ ] Test cron endpoint manually
- [ ] Check timeline API for lead

---

## 📞 Troubleshooting

### Follow-ups not sending

1. Check cron is running (Vercel logs)
2. Check `followup_queue` status
3. Verify SMTP accounts have capacity
4. Check `followup_settings.auto_followup_enabled = true`

### Replies not detected

1. Check IMAP config credentials
2. Verify `is_active = true`
3. Check `email_inbox_config.last_error`
4. Test IMAP manually

### AI not generating

1. Check `ai_providers` or `ai_settings` table
2. Verify API key is valid
3. Check `ai_generations` table for errors
4. System falls back to templates automatically

---

**Full documentation:** `FOLLOW_UP_SYSTEM_COMPLETE.md`

**Database schema:** `supabase/migrations/20240620_advanced_followup_system.sql`
