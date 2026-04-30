# Gmail SMTP Setup Instructions

## The Problem
The error "Could not find the table 'public.smtp_accounts'" means the database tables haven't been created yet in your Supabase project.

## Solution - Run the Migration

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project: `qjsnwefgzmmpsuzjfniu`
3. Click on **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Run the Migration Script
1. Open the file `RUN_THIS_IN_SUPABASE.sql` from your project
2. Copy the ENTIRE contents of that file
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter / Cmd+Enter)

### Step 3: Verify Success
After running the script, you should see:
- ✅ Several "CREATE TABLE" success messages
- ✅ "CREATE POLICY" success messages
- ✅ A final message: "SMTP tables created successfully!"

### Step 4: Test Adding Gmail SMTP
1. Go back to your application
2. Navigate to the SMTP Settings page
3. Click "Add Account"
4. Enter:
   - **Gmail Address**: your-email@gmail.com
   - **App Password**: Your 16-character Gmail App Password
   - **Daily Limit**: 500 (or less)
5. Click "Add Gmail Account"

## How to Get a Gmail App Password

1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (if not already enabled)
3. Go to https://myaccount.google.com/apppasswords
4. Select "Mail" and "Other (Custom name)"
5. Name it "Email Outreach Platform"
6. Click **Generate**
7. Copy the 16-character password (remove spaces)
8. Use this password in the SMTP settings

## Troubleshooting

### If you still get errors after running the script:
1. Make sure you're logged into your application
2. Try refreshing the page (Ctrl+R / Cmd+R)
3. Check the browser console (F12) for detailed error messages

### If the SQL script fails:
- Make sure you copied the ENTIRE script
- Check that you're in the correct Supabase project
- Try running it in smaller sections if needed

### If you can't access Supabase:
- Verify your Supabase credentials in `.env.local`
- Make sure your Supabase project is active

## What This Creates

The migration creates 4 tables:
1. **smtp_accounts** - Stores your Gmail SMTP configurations
2. **email_campaigns** - Tracks email campaigns
3. **email_queue** - Manages email sending queue
4. **email_templates** - Stores email templates

All tables have Row Level Security (RLS) enabled, so users can only see their own data.

## Next Steps

After successfully adding your Gmail SMTP accounts:
1. You can add multiple Gmail accounts (up to 60 recommended)
2. Each account can send up to 500 emails per day
3. The system will automatically rotate between accounts
4. Start sending personalized emails to your leads!
