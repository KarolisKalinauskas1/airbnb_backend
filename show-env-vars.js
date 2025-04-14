/**
 * Environment Variables Inspector
 * 
 * This script shows what Supabase environment variables are actually available to your app.
 * Run it with: node show-env-vars.js
 */

require('dotenv').config();

console.log('\n======== SUPABASE ENVIRONMENT VARIABLES ========');

// Function to safely mask sensitive values
function maskValue(value) {
  if (!value) return 'Not defined';
  if (value.length < 8) return value;
  return value.substring(0, 4) + '...' + value.substring(value.length - 4);
}

// Check all possible Supabase-related environment variables
const supabaseVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET'
];

// Display what's available
supabaseVars.forEach(varName => {
  console.log(`${varName}: ${maskValue(process.env[varName])}`);
});

// Suggest which one to use for the client
console.log('\n--- RECOMMENDATION ---');
console.log('For the client-side code and authentication middleware:');
if (process.env.SUPABASE_ANON_KEY) {
  console.log('✅ Use SUPABASE_ANON_KEY in your auth middleware');
} else if (process.env.SUPABASE_KEY) {
  console.log('✅ Use SUPABASE_KEY in your auth middleware');
} else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('⚠️ Using SUPABASE_SERVICE_ROLE_KEY is generally NOT recommended for client auth');
  console.log('   as it has full admin privileges. Consider adding SUPABASE_ANON_KEY to your .env file.');
} else {
  console.log('❌ No suitable Supabase API key found in environment variables.');
  console.log('   Please add SUPABASE_ANON_KEY to your .env file.');
}

console.log('\nFor admin-level operations in your backend:');
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('✅ Use SUPABASE_SERVICE_ROLE_KEY for admin operations');
} else {
  console.log('❌ No SUPABASE_SERVICE_ROLE_KEY found for admin operations.');
}

console.log('\n=================================================');
