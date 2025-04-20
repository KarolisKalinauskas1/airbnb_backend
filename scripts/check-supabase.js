/**
 * Check Supabase environment variables and configuration
 * 
 * This script helps identify issues with Supabase configuration.
 * Run it with: node scripts/check-supabase.js
 */
require('dotenv').config();

console.log('===== SUPABASE ENVIRONMENT VARIABLES CHECK =====');

// Check for URL
if (!process.env.SUPABASE_URL) {
  console.error('❌ SUPABASE_URL is not set');
} else {
  console.log(`✅ SUPABASE_URL: ${process.env.SUPABASE_URL}`);
}

// Check for service key with multiple possible names
const serviceKey = process.env.SUPABASE_SERVICE_KEY || 
                  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('❌ SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY is not set');
} else {
  console.log(`✅ Service key found (first 5 chars): ${serviceKey.substring(0, 5)}...`);
}

// Check for anon key with multiple possible names
const anonKey = process.env.SUPABASE_ANON_KEY || 
               process.env.SUPABASE_KEY;

if (!anonKey) {
  console.error('❌ SUPABASE_ANON_KEY/SUPABASE_KEY is not set');
} else {
  console.log(`✅ Anon key found (first 5 chars): ${anonKey.substring(0, 5)}...`);
}

console.log('\n===== RECOMMENDATIONS =====');

if (!process.env.SUPABASE_URL) {
  console.log('- Add SUPABASE_URL to your .env file');
}

if (!serviceKey) {
  console.log('- Add one of these to your .env file:');
  console.log('  SUPABASE_SERVICE_KEY=your_service_role_key');
  console.log('  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
}

if (!anonKey) {
  console.log('- Add one of these to your .env file:');
  console.log('  SUPABASE_ANON_KEY=your_anon_key');
  console.log('  SUPABASE_KEY=your_anon_key');
}

console.log('\nNote: No changes will be made to your .env file. You must update it manually.');

// Try to load the Supabase config to see if it works
try {
  const { isConfigured } = require('../config/supabase');
  console.log(`\nSupabase configuration status: ${isConfigured ? 'Configured ✅' : 'Not configured ❌'}`);
} catch (error) {
  console.error('\nError loading Supabase configuration:', error.message);
}

console.log('\n===========================================');
