# Pryro Mail — Vercel Deployment Guide

## Pre-Deployment Checklist

| Check | Status |
|---|---|
| TypeScript errors fixed | ✅ |
| Duplicate declarations removed | ✅ |
| next.config.js updated | ✅ |
| vercel.json created | ✅ |
| .gitignore correct | ✅ |
| localhost fallbacks in place | ✅ |

---

## Step 1: Generate a Real CRON_SECRET

Run this in your terminal and copy the output:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save it — you'll add it to both GitHub secrets and Vercel environment variables.

---

## Step 2: Push to GitHub

```bash
cd C:\Users\hp\Desktop\mail
git init                          # skip if already initialized
git add .
git commit -m "Ready for Vercel deployment"
```

Then create a new repo at https://github.com/new and push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/pryro-mail.git
git branch -M main
git push -u origin main
```

---

## Step 3: Deploy on Vercel

1. Go to https://vercel.com → **Add New Project**
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)
4. **Do NOT deploy yet** — add environment variables first

---

## Step 4: Add ALL Environment Variables in Vercel

Go to **Project → Settings → Environment Variables** and add every one of these:

### Required (will break if missing)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT_ID.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key from Supabase dashboard |
| `SUPABASE_SERVICE_KEY` | Your service role key from Supabase dashboard |
| `SUPABASE_PROJECT_ID` | Your Supabase project ID |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-PROJECT.vercel.app` ← update after first deploy |
| `CRON_SECRET` | The hex string you generated in Step 1 |

### Email & Integrations

| Variable | Value |
|---|---|
| `ZAPIER_WEBHOOK_URL` | Your Zapier Catch Hook URL |
| `SERPER_API_KEY` | Your Serper.dev API key (serper.dev) |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID (from twilio.com/console) |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token (from twilio.com/console) |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (Twilio sandbox) |

### Optional (OAuth — leave blank if not using)

| Variable | Value |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_API_KEY` | From Google Cloud Console (for scraping) |
| `GOOGLE_PLACES_API_KEY` | From Google Cloud Console (for scraping) |
| `GOOGLE_CX` | Google Custom Search Engine ID |
| `MICROSOFT_OAUTH_CLIENT_ID` | From Azure Portal |
| `MICROSOFT_OAUTH_CLIENT_SECRET` | From Azure Portal |
| `MICROSOFT_OAUTH_TENANT_ID` | From Azure Portal (or use "common") |

---

## Step 5: Deploy

Click **Deploy** in Vercel. The build takes 2-5 minutes.

After deploy, **immediately update** `NEXT_PUBLIC_APP_URL` to your real Vercel URL:
```
https://pryro-mail-xxxxx.vercel.app
```

Then redeploy (Vercel → Deployments → Redeploy) so the URL takes effect.

---

## Step 6: Configure Supabase for Production

In your Supabase dashboard:

1. **Authentication → URL Configuration**
   - Site URL: `https://YOUR-PROJECT.vercel.app`
   - Redirect URLs: Add `https://YOUR-PROJECT.vercel.app/**`

2. **Authentication → Redirect URLs** — add:
   ```
   https://YOUR-PROJECT.vercel.app/auth/callback
   https://YOUR-PROJECT.vercel.app/api/auth/gmail/callback
   https://YOUR-PROJECT.vercel.app/api/auth/outlook/callback
   ```

3. Run all pending migrations in **SQL Editor**:
   - Open `RUN_ALL_MIGRATIONS.sql` and execute it
   - Then run `ADD_SENDER_PROFILE_TABLE.sql`

---

## Step 7: Test After Deployment (in order)

1. **Home page** — `https://your-app.vercel.app` loads
2. **Sign up** — create a test account
3. **SMTP** — add a Gmail account, click Test Connection
4. **Send test email** — single email to yourself
5. **Scraper** — scrape 5 pharmacies in Kampala
6. **Email generation** — generate emails for scraped leads
7. **Follow-up** — generate FU #1 for a contacted lead
8. **Analytics** — open Analytics tab, stats load

---

## Cron Jobs

Vercel cron jobs fire automatically based on `vercel.json`:

| Job | Schedule | What it does |
|---|---|---|
| `/api/cron/process-followups` | Daily at 8am UTC | Sends due follow-ups |
| `/api/cron/scan-inbox` | Every 5 minutes | Checks for replies |

Vercel sends a `GET` request with `Authorization: Bearer YOUR_CRON_SECRET`.
Both routes accept this and process the queue.

---

## Custom Domain (Optional)

1. In Vercel → **Project → Settings → Domains** → Add domain
2. In your DNS provider, add:
   - `CNAME pryromail.com cname.vercel-dns.com`
   - Or `A record → 76.76.21.21`
3. After DNS propagates, update `NEXT_PUBLIC_APP_URL` to the custom domain
4. Update Supabase redirect URLs to include the custom domain

---

## Common Deployment Errors

| Error | Cause | Fix |
|---|---|---|
| Build fails — TypeScript error | Type mismatch | Run `npx tsc --noEmit` locally first |
| 500 on all API routes | Missing env vars | Check Supabase URL and keys in Vercel |
| Auth redirect loop | Wrong site URL | Update Site URL in Supabase Auth settings |
| Cron jobs not firing | Wrong CRON_SECRET | Verify exact match in Vercel env and vercel.json |
| Puppeteer scraper fails | No Chrome on Vercel | Expected — scraper uses fetch fallback automatically |
| SMTP send fails | Port 465 blocked | Use port 587 with STARTTLS instead |
