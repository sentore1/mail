# Gmail SMTP Integration - Quick Start

## 🚀 What Changed

Your SMTP Manager now **ONLY supports Gmail** accounts. This simplifies setup and ensures consistent email delivery.

## ✅ Features

- **Gmail Only**: Simplified to only accept @gmail.com addresses
- **Auto-Configuration**: SMTP settings (host, port) are automatically set
- **Email Validation**: Only valid Gmail addresses are accepted
- **App Password Support**: Uses Gmail App Passwords for security
- **Daily Limits**: Configure up to 500 emails per day per account
- **Multiple Accounts**: Add multiple Gmail accounts for higher volume

## 📋 Setup Steps

### 1. Create Database Tables
Run `RUN_THIS_IN_SUPABASE.sql` in your Supabase SQL Editor

### 2. Get Gmail App Password
- Enable 2-Step Verification on your Google Account
- Generate an App Password at https://myaccount.google.com/apppasswords
- Copy the 16-character password

### 3. Add Gmail Account
- Go to SMTP Settings in your app
- Click "Add Account"
- Enter your Gmail address and App Password
- Set daily limit (max 500)
- Click "Add Gmail Account"

## 📁 Important Files

- **RUN_THIS_IN_SUPABASE.sql** - Database migration (run this first!)
- **SETUP_INSTRUCTIONS.md** - Detailed setup guide
- **TEST_SMTP_SETUP.sql** - Diagnostic queries
- **src/components/platform/SMTPManager.tsx** - Gmail-only SMTP manager
- **src/app/actions.ts** - Server actions with improved error handling

## 🔧 Technical Details

### Database Schema
```sql
smtp_accounts (
  id UUID PRIMARY KEY,
  user_id UUID (references auth.users),
  email VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER DEFAULT 587,
  user_name VARCHAR(255) NOT NULL,
  password TEXT NOT NULL,
  provider VARCHAR(50) DEFAULT 'Gmail',
  daily_limit INTEGER DEFAULT 500,
  sent_today INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### Gmail SMTP Configuration
- **Host**: smtp.gmail.com
- **Port**: 587
- **Security**: TLS/STARTTLS
- **Authentication**: App Password required

## 🎯 Usage

### Adding an Account
```typescript
// Automatically configured when you enter a Gmail address
{
  email: "your-email@gmail.com",
  host: "smtp.gmail.com",  // Auto-set
  port: 587,                // Auto-set
  provider: "Gmail",        // Auto-set
  daily_limit: 500,         // Configurable
  password: "app-password"  // Your 16-char App Password
}
```

### Sending Emails
The system automatically:
- Rotates between available Gmail accounts
- Tracks daily sending limits
- Queues emails when limits are reached
- Retries failed sends

## 🛡️ Security

- Row Level Security (RLS) enabled
- Users can only access their own SMTP accounts
- Passwords stored in database (encrypt in production!)
- App Passwords recommended over regular passwords

## 📊 Capacity Management

- **Single Account**: Up to 500 emails/day
- **10 Accounts**: Up to 5,000 emails/day
- **60 Accounts**: Up to 30,000 emails/day

The dashboard shows:
- Total daily capacity
- Emails sent today
- Remaining capacity
- Active accounts

## 🐛 Troubleshooting

### "Could not find the table 'public.smtp_accounts'"
→ Run `RUN_THIS_IN_SUPABASE.sql` in Supabase SQL Editor

### "Only Gmail addresses are supported"
→ Make sure email ends with @gmail.com

### "Authentication required"
→ Log in to your account and refresh the page

### "This email address is already added"
→ Email already exists in your SMTP accounts

### "Permission denied"
→ Check RLS policies are set up correctly

## 📝 Notes

- Gmail requires App Passwords (not regular passwords)
- 2-Step Verification must be enabled for App Passwords
- Free Gmail accounts: 500 emails/day limit
- Google Workspace: 2,000 emails/day limit
- Emails are sent with delays to avoid spam filters

## 🔗 Useful Links

- [Gmail App Passwords](https://myaccount.google.com/apppasswords)
- [Google 2-Step Verification](https://myaccount.google.com/security)
- [Gmail Sending Limits](https://support.google.com/mail/answer/22839)
- [Supabase Dashboard](https://supabase.com/dashboard)

## 💡 Tips

1. **Use Multiple Accounts**: Add 5-10 Gmail accounts for better volume
2. **Monitor Limits**: Check the dashboard regularly
3. **Test First**: Send test emails before bulk campaigns
4. **Warm Up**: Start with small volumes and increase gradually
5. **Personalize**: Use personalized content to avoid spam filters
