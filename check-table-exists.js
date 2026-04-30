// Check if table exists using raw SQL query
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qjsnwefgzmmpsuzjfniu.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqc253ZWZnem1tcHN1empmbml1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzUzOTYwMCwiZXhwIjoyMDkzMTE1NjAwfQ.rMcO09qXnos8LjXOrtH6KDih3jPfTqi9C1UNwppP6Vc';

const supabase = createClient(supabaseUrl, serviceKey);

async function checkTable() {
  console.log('🔍 Checking if smtp_accounts table exists in database...\n');

  // Query the database directly to check if table exists
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'smtp_accounts'
      ) as table_exists;
    `
  });

  if (error) {
    console.log('⚠️  Cannot check with RPC, trying alternative method...');
    
    // Alternative: Try to query pg_tables
    const { data: pgData, error: pgError } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public')
      .eq('tablename', 'smtp_accounts');
    
    if (pgError) {
      console.log('❌ Cannot verify table existence');
      console.log('Error:', pgError.message);
      console.log('\n📋 Please verify manually:');
      console.log('1. Go to: https://supabase.com/dashboard/project/qjsnwefgzmmpsuzjfniu/editor');
      console.log('2. Look for "smtp_accounts" in the tables list on the left');
      console.log('3. If you see it, reload schema cache at Settings > API');
      console.log('4. If you don\'t see it, run MINIMAL_SMTP_SETUP.sql again');
    } else {
      if (pgData && pgData.length > 0) {
        console.log('✅ Table EXISTS in database!');
        console.log('\n⚠️  But schema cache is stale. You MUST reload it:');
        console.log('1. Go to: https://supabase.com/dashboard/project/qjsnwefgzmmpsuzjfniu/settings/api');
        console.log('2. Click "Reload schema cache" button');
        console.log('3. Wait 10 seconds');
        console.log('4. Run: node test-smtp-direct.js');
      } else {
        console.log('❌ Table does NOT exist in database');
        console.log('\n📋 Run the SQL again:');
        console.log('1. Go to: https://supabase.com/dashboard/project/qjsnwefgzmmpsuzjfniu/sql/new');
        console.log('2. Copy contents of MINIMAL_SMTP_SETUP.sql');
        console.log('3. Paste and click "Run"');
        console.log('4. Look for success message');
      }
    }
    return;
  }

  if (data && data[0]?.table_exists) {
    console.log('✅ Table EXISTS in database!');
    console.log('\n⚠️  Schema cache needs reload:');
    console.log('1. Go to: https://supabase.com/dashboard/project/qjsnwefgzmmpsuzjfniu/settings/api');
    console.log('2. Click "Reload schema cache" button');
  } else {
    console.log('❌ Table does NOT exist');
    console.log('\nRun MINIMAL_SMTP_SETUP.sql in Supabase SQL Editor');
  }
}

checkTable().catch(console.error);
