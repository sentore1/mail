// Test SMTP table directly with Node.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qjsnwefgzmmpsuzjfniu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqc253ZWZnem1tcHN1empmbml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1Mzk2MDAsImV4cCI6MjA5MzExNTYwMH0.n92Fb_St8lzeb7t3R-PwVgo6LI0zgZLFeiypK__srTc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSmtpTable() {
  console.log('🔍 Testing smtp_accounts table...\n');

  // Test 1: Check if table exists
  console.log('Test 1: Checking if table exists...');
  const { data, error } = await supabase
    .from('smtp_accounts')
    .select('*')
    .limit(1);

  if (error) {
    console.log('❌ FAILED - Table does not exist or is not accessible');
    console.log('Error:', error.message);
    console.log('Code:', error.code);
    console.log('Details:', error.details);
    console.log('\n📋 Action Required:');
    console.log('1. Go to: https://supabase.com/dashboard/project/qjsnwefgzmmpsuzjfniu/sql/new');
    console.log('2. Copy contents of MINIMAL_SMTP_SETUP.sql');
    console.log('3. Paste and click "Run"');
    console.log('4. Go to Settings > API > Click "Reload schema cache"');
    console.log('5. Run this test again: node test-smtp-direct.js');
    return;
  }

  console.log('✅ SUCCESS - Table exists!');
  console.log('Records found:', data?.length || 0);
  
  // Test 2: Check authentication
  console.log('\nTest 2: Checking authentication...');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.log('⚠️  Not authenticated - You need to sign in first');
    console.log('This is normal if you\'re not logged in');
  } else {
    console.log('✅ Authenticated as:', user.email);
    console.log('User ID:', user.id);
  }

  // Test 3: Try to insert (will fail if not authenticated, but tests RLS)
  console.log('\nTest 3: Testing RLS policies...');
  if (user) {
    const testData = {
      user_id: user.id,
      email: 'test@gmail.com',
      host: 'smtp.gmail.com',
      port: 587,
      user_name: 'test@gmail.com',
      password: 'test-password',
      provider: 'Gmail',
      daily_limit: 500
    };

    const { data: insertData, error: insertError } = await supabase
      .from('smtp_accounts')
      .insert(testData)
      .select();

    if (insertError) {
      if (insertError.code === '23505') {
        console.log('✅ RLS working - Duplicate email detected (this is good)');
      } else {
        console.log('❌ Insert failed:', insertError.message);
      }
    } else {
      console.log('✅ Insert successful! Test record created:', insertData[0]?.id);
      
      // Clean up test record
      await supabase
        .from('smtp_accounts')
        .delete()
        .eq('id', insertData[0].id);
      console.log('🧹 Test record cleaned up');
    }
  } else {
    console.log('⏭️  Skipped - Not authenticated');
  }

  console.log('\n✅ All tests complete!');
}

testSmtpTable().catch(console.error);
