# Create smtp_accounts table using service role key
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqc253ZWZnem1tcHN1empmbml1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzUzOTYwMCwiZXhwIjoyMDkzMTE1NjAwfQ.rMcO09qXnos8LjXOrtH6KDih3jPfTqi9C1UNwppP6Vc"

$headers = @{
    "apikey" = $serviceKey
    "Authorization" = "Bearer $serviceKey"
    "Content-Type" = "application/json"
}

$sql = @"
-- Create smtp_accounts table
CREATE TABLE IF NOT EXISTS public.smtp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  user_name VARCHAR(255) NOT NULL,
  password TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'Gmail',
  daily_limit INTEGER NOT NULL DEFAULT 500,
  sent_today INTEGER NOT NULL DEFAULT 0,
  last_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, email)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_smtp_accounts_user_id ON public.smtp_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_smtp_accounts_status ON public.smtp_accounts(status);

-- Enable RLS
ALTER TABLE public.smtp_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own SMTP accounts" ON public.smtp_accounts;
DROP POLICY IF EXISTS "Users can insert their own SMTP accounts" ON public.smtp_accounts;
DROP POLICY IF EXISTS "Users can update their own SMTP accounts" ON public.smtp_accounts;
DROP POLICY IF EXISTS "Users can delete their own SMTP accounts" ON public.smtp_accounts;

-- Create RLS policies
CREATE POLICY "Users can view their own SMTP accounts"
  ON public.smtp_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own SMTP accounts"
  ON public.smtp_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMTP accounts"
  ON public.smtp_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SMTP accounts"
  ON public.smtp_accounts FOR DELETE
  USING (auth.uid() = user_id);
"@

$body = @{
    query = $sql
} | ConvertTo-Json

Write-Host "Creating smtp_accounts table via API..." -ForegroundColor Yellow

try {
    $result = Invoke-RestMethod -Uri "https://qjsnwefgzmmpsuzjfniu.supabase.co/rest/v1/rpc/exec_sql" -Method Post -Headers $headers -Body $body
    Write-Host "✅ Table created successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ API method failed. You must run the SQL manually in Supabase Dashboard." -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test if table exists now
Write-Host "`nTesting table access..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

$testHeaders = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqc253ZWZnem1tcHN1empmbml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mzk2MDAsImV4cCI6MjA5MzExNTYwMH0.n92Fb_St8lzeb7t3R-PwVgo6LI0zgZLFeiypK__srTc"
    "Content-Type" = "application/json"
}

try {
    $testResult = Invoke-RestMethod -Uri "https://qjsnwefgzmmpsuzjfniu.supabase.co/rest/v1/smtp_accounts?select=*&limit=1" -Method Get -Headers $testHeaders
    Write-Host "✅ Table is accessible!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Table may exist but cache needs refresh" -ForegroundColor Yellow
    Write-Host "Please go to Supabase Dashboard > Settings > API and click 'Reload schema cache'" -ForegroundColor Cyan
}
"@
