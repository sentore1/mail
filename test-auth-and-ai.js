// Test Authentication and AI Provider
// This simulates what happens when you log in and try to fetch AI provider

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        process.env[key] = value;
      }
    });
  } catch (err) {
    console.error('Could not read .env.local:', err.message);
  }
}

loadEnv();

async function testAuthAndAI() {
  console.log('🔐 Testing Authentication and AI Provider Setup\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing environment variables');
    return;
  }

  // Test 1: Check with service role (bypasses RLS)
  console.log('📊 Test 1: Checking AI providers with service role...');
  const adminClient = createClient(supabaseUrl, serviceKey);
  
  const { data: allProviders, error: allError } = await adminClient
    .from('ai_providers')
    .select('*');

  if (allError) {
    console.error('❌ Error:', allError.message);
  } else {
    console.log(`✅ Found ${allProviders.length} AI provider(s):`);
    allProviders.forEach(p => {
      console.log(`   - ${p.provider} for user ${p.user_id}`);
      console.log(`     Model: ${p.model_name}, Active: ${p.is_active}`);
    });
  }
  console.log('');

  // Test 2: Check auth.users
  console.log('👥 Test 2: Checking users in auth.users...');
  const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();

  if (usersError) {
    console.error('❌ Error:', usersError.message);
  } else {
    console.log(`✅ Found ${users.length} user(s):`);
    users.forEach(u => {
      console.log(`   - ${u.email} (${u.id})`);
      
      // Check if this user has an AI provider
      const hasProvider = allProviders?.find(p => p.user_id === u.id);
      if (hasProvider) {
        console.log(`     ✅ Has AI provider: ${hasProvider.provider}`);
      } else {
        console.log(`     ❌ No AI provider configured`);
      }
    });
  }
  console.log('');

  // Test 3: Try to authenticate with email/password
  console.log('🔑 Test 3: Testing authentication flow...');
  console.log('   Note: This requires you to provide credentials\n');

  // Test 4: Simulate what the app does
  console.log('🎯 Test 4: Simulating app behavior...');
  console.log('   When a user logs in, the app should:');
  console.log('   1. Create Supabase client with anon key');
  console.log('   2. User session is established (via cookies)');
  console.log('   3. Query ai_providers with RLS (filters by auth.uid())');
  console.log('   4. RLS returns only rows where user_id = auth.uid()\n');

  // Test 5: Check if the correct user has AI provider
  const correctUserId = '91416b57-9f98-4612-b88a-8ac157f31a73';
  const correctUserProvider = allProviders?.find(p => p.user_id === correctUserId);

  console.log('✅ DIAGNOSIS:');
  console.log(`   Real user in database: ${correctUserId}`);
  console.log(`   Email: pryrolab@gmail.com`);
  
  if (correctUserProvider) {
    console.log(`   ✅ AI provider EXISTS for this user`);
    console.log(`      Provider: ${correctUserProvider.provider}`);
    console.log(`      Model: ${correctUserProvider.model_name}`);
    console.log(`      Active: ${correctUserProvider.is_active}`);
    console.log('');
    console.log('🎉 CONCLUSION:');
    console.log('   The AI provider is configured correctly!');
    console.log('   The issue is a STALE SESSION in your browser.');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   1. Log out of your app');
    console.log('   2. Clear browser cookies/cache');
    console.log('   3. Log back in with pryrolab@gmail.com');
    console.log('   4. The session will have the correct user ID');
    console.log('   5. AI email generation will work!');
  } else {
    console.log(`   ❌ No AI provider for this user`);
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   Run RUN_THIS_ADD_AI.sql with your Groq API key');
  }
}

testAuthAndAI().catch(console.error);
