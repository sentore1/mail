// Test AI Provider Setup
// Run with: node test-ai-provider.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
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

async function testAIProvider() {
  console.log('🔍 Testing AI Provider Setup...\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase environment variables!');
    console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
    console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
    return;
  }

  console.log('✅ Environment variables found\n');

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Test 1: Check if we can connect
  console.log('📡 Test 1: Testing Supabase connection...');
  const { data: testData, error: testError } = await supabase
    .from('ai_providers')
    .select('count');
  
  if (testError) {
    console.error('❌ Connection failed:', testError.message);
    return;
  }
  console.log('✅ Connected to Supabase\n');

  // Test 2: Get all users (this will show us what users exist)
  console.log('👥 Test 2: Fetching all users from auth.users...');
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  
  if (usersError) {
    console.log('⚠️  Cannot fetch users (need service role key)');
    console.log('   This is normal - we\'ll check differently\n');
  } else {
    console.log('Users found:');
    users.users.forEach(user => {
      console.log(`  - ${user.email} (ID: ${user.id})`);
    });
    console.log('');
  }

  // Test 3: Check AI providers table (without auth)
  console.log('🤖 Test 3: Checking AI providers (no auth)...');
  const { data: allProviders, error: allError } = await supabase
    .from('ai_providers')
    .select('*');
  
  if (allError) {
    console.log('⚠️  Cannot query without auth (RLS is enabled)');
    console.log('   Error:', allError.message, '\n');
  } else {
    console.log('AI Providers found:', allProviders.length);
    allProviders.forEach(p => {
      console.log(`  - ${p.provider} (${p.model_name}) - Active: ${p.is_active}`);
      console.log(`    User ID: ${p.user_id}`);
    });
    console.log('');
  }

  // Test 4: Try to authenticate and check
  console.log('🔐 Test 4: Checking current session...');
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    console.log('❌ No active session found');
    console.log('   This means the app needs a logged-in user\n');
    
    console.log('📋 DIAGNOSIS:');
    console.log('   The AI provider is in the database, but RLS policies require');
    console.log('   an authenticated user session to access it.');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log('   1. Make sure you\'re logged into your app');
    console.log('   2. Check browser console when generating emails');
    console.log('   3. Look for "Authenticated user ID" in the logs');
    console.log('   4. That ID must match the user_id in ai_providers table\n');
    
    return;
  }

  console.log('✅ Session found!');
  console.log('   User ID:', session.user.id);
  console.log('   Email:', session.user.email, '\n');

  // Test 5: Try to fetch AI provider with auth
  console.log('🎯 Test 5: Fetching AI provider for authenticated user...');
  const { data: aiProvider, error: aiError } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .single();

  if (aiError || !aiProvider) {
    console.log('❌ No AI provider found for this user');
    console.log('   Error:', aiError?.message || 'No data returned');
    console.log('');
    console.log('💡 SOLUTION:');
    console.log(`   Run this SQL in Supabase to add AI provider for user ${session.user.id}:`);
    console.log('');
    console.log(`   INSERT INTO public.ai_providers (user_id, provider, api_key, model_name, is_active)`);
    console.log(`   VALUES ('${session.user.id}'::uuid, 'groq', 'YOUR_GROQ_API_KEY', 'llama-3.3-70b-versatile', true)`);
    console.log(`   ON CONFLICT (user_id, provider) DO UPDATE SET is_active = true;`);
    console.log('');
    return;
  }

  console.log('✅ AI Provider found!');
  console.log('   Provider:', aiProvider.provider);
  console.log('   Model:', aiProvider.model_name);
  console.log('   Active:', aiProvider.is_active);
  console.log('   API Key:', aiProvider.api_key.substring(0, 10) + '...');
  console.log('');
  console.log('🎉 Everything looks good! AI email generation should work.');
}

testAIProvider().catch(console.error);
