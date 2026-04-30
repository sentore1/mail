# Test if smtp_accounts table exists after running migration
$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqc253ZWZnem1tcHN1empmbml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mzk2MDAsImV4cCI6MjA5MzExNTYwMH0.n92Fb_St8lzeb7t3R-PwVgo6LI0zgZLFeiypK__srTc"
    "Content-Type" = "application/json"
}

Write-Host "Testing smtp_accounts table..." -ForegroundColor Yellow
try {
    $result = Invoke-RestMethod -Uri "https://qjsnwefgzmmpsuzjfniu.supabase.co/rest/v1/smtp_accounts?select=*&limit=1" -Method Get -Headers $headers
    Write-Host "✅ SUCCESS! smtp_accounts table exists and is accessible" -ForegroundColor Green
    Write-Host "Found $($result.Count) records" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED! smtp_accounts table does not exist" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nPlease run RUN_THIS_IN_SUPABASE.sql in your Supabase SQL Editor" -ForegroundColor Yellow
}
