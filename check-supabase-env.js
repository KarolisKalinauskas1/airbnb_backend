/**
 * Quick Supabase Environment Variable Checker
 * 
 * Run this with: node check-supabase-env.js
 */

require('dotenv').config();

console.log('\n=== SUPABASE ENVIRONMENT VARIABLES ===\n');

// Check essential variables
const variables = {
  'SUPABASE_URL': process.env.SUPABASE_URL,
  'SUPABASE_KEY': process.env.SUPABASE_KEY,
  'SUPABASE_ANON_KEY': process.env.SUPABASE_ANON_KEY,
  'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY
};

// Print status of each variable
Object.entries(variables).forEach(([name, value]) => {
  console.log(`${name}: ${value ? 'Found ✓' : 'Missing ✗'}`);
});

// Identify what needs to be fixed
console.log('\n=== WHAT TO DO ===\n');

if (!process.env.SUPABASE_URL) {
  console.log('Add your Supabase project URL to .env:');
  console.log('SUPABASE_URL=https://your-project-id.supabase.co\n');
}

if (!process.env.SUPABASE_KEY && !process.env.SUPABASE_ANON_KEY) {
  console.log('Add your Supabase anon/public key to .env:');
  console.log('SUPABASE_KEY=your_anon_key_here\n');
  console.log('You can find this in Supabase dashboard → Project Settings → API → anon public\n');
}

console.log('=== EXAMPLE .ENV ENTRY ===\n');
console.log('SUPABASE_URL=https://example.supabase.co');
console.log('SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5c...\n');
