# Complete Email Outreach System Setup Guide

## System Overview

This system allows you to:
- ✅ Scrape leads based on niche and location (accurate filtering)
- ✅ Verify email addresses before sending
- ✅ Generate personalized emails for each lead
- ✅ Send 6,000 emails/day using 60 Gmail SMTP accounts
- ✅ Automatic SMTP rotation and rate limiting
- ✅ Bulk email sending with chunking (100 emails per batch)
- ✅ Track campaigns and email status

---

## Step 1: Database Setup

Run the complete migration:

```bash
# In Supabase SQL Editor, run:
supabase/migrations/20240603_complete_setup.sql
```

This creates all necessary tables:
- `leads` - Scraped company data
- `smtp_accounts` - Your 60 Gmail accounts
- `email_campaigns` - Campaign tracking
- `email_queue` - Email sending queue
- `email_templates` - Reusable templates

---

## Step 2: Create 60 Gmail Accounts

### Option A: Manual Creation (Free)
1. Create 60 Gmail accounts (e.g., outreach1@gmail.com to outreach60@gmail.com)
2. For each account:
   - Enable 2-Factor Authentication
   - Generate App Password: https://myaccount.google.com/apppasswords
   - Save the 16-character password

### Option B: Use Existing Accounts
- Use your existing Gmail accounts
- Each can send 100 emails/day
- Total: 60 accounts × 100 = 6,000 emails/day

### Gmail App Password Setup:
1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Go to App Passwords
4. Select "Mail" and your device
5. Copy the generated password (e.g., "abcd efgh ijkl mnop")

---

## Step 3: Add SMTP Accounts to System

### Via UI (Recommended):
1. Navigate to SMTP Manager in your platform
2. Click "Add Account"
3. Fill in for each Gmail account:
   - **Provider**: Gmail
   - **Email**: outreach1@gmail.com
   - **SMTP Host**: smtp.gmail.com
   - **Port**: 587
   - **Username**: (leave empty or use email)
   - **Password**: Your app password (16 characters)
   - **Daily Limit**: 100

4. Repeat for all 60 accounts

### Via Database (Bulk):
```sql
-- Example: Insert multiple accounts at once
INSERT INTO smtp_accounts (user_id, email, host, port, user_name, password, provider, daily_limit, status)
VALUES
  ('your-user-id', 'outreach1@gmail.com', 'smtp.gmail.com', 587, 'outreach1@gmail.com', 'app-password-1', 'gmail', 100, 'active'),
  ('your-user-id', 'outreach2@gmail.com', 'smtp.gmail.com', 587, 'outreach2@gmail.com', 'app-password-2', 'gmail', 100, 'active'),
  -- ... repeat for all 60 accounts
  ('your-user-id', 'outreach60@gmail.com', 'smtp.gmail.com', 587, 'outreach60@gmail.com', 'app-password-60', 'gmail', 100, 'active');
```

---

## Step 4: Configure Scraping (Optional)

Add API keys to `.env.local` for better scraping:

```env
# Google Places API (Best for local businesses)
GOOGLE_PLACES_API_KEY=your_key_here

# Google Custom Search (Best for finding websites)
GOOGLE_API_KEY=your_key_here
GOOGLE_CX=your_search_engine_id_here
```

### Get Google Places API Key:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Create a new project
3. Enable "Places API"
4. Create credentials → API Key
5. Copy the key

### Without API Keys:
The system still works using:
- Yellow Pages scraping (free)
- Yelp scraping (free)
- Smart email pattern generation
- Website contact page scraping

---

## Step 5: How to Use the System

### A. Scrape Leads

1. Go to **Scraper Module**
2. Enter:
   - **Niche**: "SaaS", "E-Commerce", "Digital Marketing", etc.
   - **Location**: "New York, USA", "London, UK", "San Francisco", etc.
3. Click **"Scrape"**
4. System will:
   - Search Google Places, Yellow Pages, Yelp
   - Extract company names, emails, phones
   - Verify email addresses
   - Show results

### B. Generate & Send Bulk Emails

1. **Select leads** (check boxes next to companies)
2. Click **"Generate & Send Bulk Emails"** button
3. Fill in:
   - **Your Company Name**: e.g., "Acme Solutions"
   - **Your Service**: e.g., "AI-powered marketing automation"
   - **Tone**: Professional / Casual / Friendly
   - **Purpose**: Introduction / Partnership / Sales / Networking
4. Click **"Generate Emails"**
5. Preview personalized emails
6. Click **"Send All Emails"**

### C. What Happens During Sending:

```
1. Email Verification (2-3 seconds per email)
   ✓ Checks DNS MX records
   ✓ Filters invalid emails
   
2. Chunked Sending (100 emails per chunk)
   ✓ Chunk 1: Emails 1-100
   ✓ 5-second delay
   ✓ Chunk 2: Emails 101-200
   ✓ Continue until all sent
   
3. SMTP Rotation
   ✓ Account 1 sends email 1
   ✓ Account 2 sends email 2
   ✓ Account 3 sends email 3
   ✓ ... rotates through all 60 accounts
   ✓ Each account sends ~100 emails/day
   
4. Rate Limiting
   ✓ 2-second delay between emails
   ✓ Prevents spam filters
   ✓ Looks more natural
   
5. Queue Overflow
   ✓ If daily limit reached, queues for tomorrow
   ✓ Automatic retry for failed emails
```

---

## Step 6: Monitor Performance

### SMTP Manager Dashboard:
- View all 60 accounts
- See usage per account (e.g., 45/100 sent today)
- Total capacity: 6,000 emails/day
- Remaining capacity updates in real-time

### Campaign Tracking:
- Total emails sent
- Failed emails
- Queued for later
- Open rates (if tracking enabled)

---

## Example Workflow

### Scenario: Send 1,000 emails

1. **Scrape 1,000 leads**
   - Niche: "SaaS"
   - Location: "United States"
   - Time: ~5 minutes

2. **Select all 1,000 leads**
   - Check "Select All" box

3. **Generate bulk emails**
   - Company: "Your Company"
   - Service: "Your Service"
   - Time: ~2 minutes

4. **Send emails**
   - Chunk 1: 100 emails (Account 1-60, then 1-40)
   - Chunk 2: 100 emails
   - ... continues
   - Chunk 10: 100 emails
   - Total time: ~1 hour (with 2-second delays)

5. **Results**
   - ✅ 950 sent successfully
   - ❌ 30 failed (invalid emails)
   - ⏰ 20 queued for tomorrow

---

## Best Practices

### 1. Warm Up New Accounts
- **Week 1**: Send 10-20 emails/day per account
- **Week 2**: Send 30-50 emails/day per account
- **Week 3**: Send 70-80 emails/day per account
- **Week 4+**: Send 100 emails/day per account

### 2. Email Content
- ✅ Personalize with company name, niche, location
- ✅ Keep emails short (50-150 words)
- ✅ One clear call-to-action
- ✅ Include unsubscribe link
- ❌ Avoid spam words (FREE, URGENT, BUY NOW)
- ❌ Don't use ALL CAPS
- ❌ Limit links (max 2-3)

### 3. Sending Strategy
- Send during business hours (9 AM - 5 PM recipient timezone)
- Avoid weekends
- Space out campaigns (don't send 6,000 in one day initially)
- Monitor bounce rates (should be <5%)

### 4. Email Verification
- Always verify emails before sending
- Remove invalid emails
- Keep bounce rate low to maintain sender reputation

---

## Troubleshooting

### "No SMTP accounts available"
**Solution**: Add more Gmail accounts or wait until tomorrow (daily limits reset at midnight UTC)

### "Failed to send email"
**Causes**:
- Wrong app password
- Account locked by Google
- Daily limit reached

**Solution**:
- Verify app password
- Check account status in Gmail
- Wait 24 hours for limit reset

### Low deliverability
**Solutions**:
- Warm up accounts gradually
- Improve email content
- Add SPF/DKIM records (advanced)
- Use custom domain (advanced)

### Emails going to spam
**Solutions**:
- Reduce sending volume
- Improve personalization
- Add unsubscribe link
- Avoid spam trigger words
- Warm up accounts properly

---

## Advanced: Custom Domain Setup

For better deliverability, use custom domains:

1. Buy domain (e.g., outreach.yourcompany.com)
2. Set up Google Workspace
3. Configure SPF record:
   ```
   v=spf1 include:_spf.google.com ~all
   ```
4. Configure DKIM in Google Workspace
5. Configure DMARC:
   ```
   v=DMARC1; p=none; rua=mailto:dmarc@yourcompany.com
   ```

---

## Cost Breakdown

### Free Tier (60 Gmail accounts):
- **Cost**: $0/month
- **Capacity**: 6,000 emails/day
- **Best for**: Testing, small campaigns

### Budget Tier (30 Gmail + 30 paid):
- **Cost**: $50-100/month
- **Capacity**: 6,000+ emails/day
- **Better deliverability**

### Professional Tier (SendGrid/Mailgun):
- **Cost**: $200-500/month
- **Capacity**: 10,000+ emails/day
- **Best deliverability**
- **Advanced features**

---

## Support & Next Steps

1. ✅ Run database migration
2. ✅ Create 60 Gmail accounts
3. ✅ Add accounts to SMTP Manager
4. ✅ Test with 10 emails
5. ✅ Gradually scale up
6. ✅ Monitor and optimize

**You're ready to send 6,000 personalized emails per day!** 🚀
