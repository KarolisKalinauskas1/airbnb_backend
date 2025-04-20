/**
 * Quick Supabase Environment Variable Checker
 * Run this with: node check-supabase-env.js
 */

require('dotenv').config();

console.log('\n=== SUPABASE ENVIRONMENT VARIABLES ===\n');

// Check essential variables
const variables = {
  'SUPABASE_URL': process.env.SUPABASE_URL,
  'SUPABASE_KEY': process.env.SUPABASE_KEY,
  'SUPABASE_ANON_KEY': process.env.SUPABASE_ANON_KEY,
  'SUPABASE_SERVICE_KEY': process.env.SUPABASE_SERVICE_KEY,
  'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY
};

// Print status of each variable
Object.entries(variables).forEach(([name, value]) => {
  console.log(`${name}: ${value ? 'Found ✓' : 'Missing ✗'}`);
  if (value) {
    console.log(`  Value: ${value.substring(0, 4)}...${value.substring(value.length - 4)}`);
  }
});

// Test connection if URL and a key is present
if (process.env.SUPABASE_URL && (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.log('\n=== TESTING CONNECTION ===\n');
  
  const { createClient } = require('@supabase/supabase-js');
  
  let client;
  if (process.env.SUPABASE_KEY) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    console.log('Using SUPABASE_KEY for connection test');
  } else if (process.env.SUPABASE_ANON_KEY) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    console.log('Using SUPABASE_ANON_KEY for connection test');
  } else if (process.env.SUPABASE_SERVICE_KEY) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    console.log('Using SUPABASE_SERVICE_KEY for connection test');
  } else {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log('Using SUPABASE_SERVICE_ROLE_KEY for connection test');
  }
  
  // Try to get system health
  client.from('_pgrst_health').select('*').limit(1)
    .then(response => {
      if (response.error) {
        console.log('❌ Connection test failed:', response.error.message);
      } else {
        console.log('✅ Connection test successful!');
      }
    })
    .catch(error => {
      console.log('❌ Connection test failed with exception:', error.message);
    });
}

console.log('\n=== REQUIRED CONFIGURATION ===\n');
console.log('Make sure these are in your .env file:');
console.log('SUPABASE_URL=https://your-project.supabase.co');
console.log('SUPABASE_KEY=your_anon_key');
console.log('SUPABASE_SERVICE_KEY=your_service_role_key\n');
