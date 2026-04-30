// Force reload Supabase schema cache
const https = require('https');

const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqc253ZWZnem1tcHN1empmbml1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzUzOTYwMCwiZXhwIjoyMDkzMTE1NjAwfQ.rMcO09qXnos8LjXOrtH6KDih3jPfTqi9C1UNwppP6Vc';

console.log('🔄 Reloading Supabase schema cache...\n');

const options = {
  hostname: 'qjsnwefgzmmpsuzjfniu.supabase.co',
  port: 443,
  path: '/rest/v1/rpc/reload_schema',
  method: 'POST',
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 204) {
      console.log('✅ Schema cache reloaded successfully!');
      console.log('\nNow test again:');
      console.log('  node test-smtp-direct.js');
    } else {
      console.log('⚠️  Response:', res.statusCode);
      console.log('Data:', data);
      console.log('\n📋 Manual reload required:');
      console.log('1. Go to: https://supabase.com/dashboard/project/qjsnwefgzmmpsuzjfniu/settings/api');
      console.log('2. Scroll down to "PostgREST Configuration"');
      console.log('3. Click "Reload schema cache" button');
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Error:', e.message);
  console.log('\n📋 Manual reload required:');
  console.log('1. Go to: https://supabase.com/dashboard/project/qjsnwefgzmmpsuzjfniu/settings/api');
  console.log('2. Scroll down to "PostgREST Configuration"');
  console.log('3. Click "Reload schema cache" button');
});

req.end();
