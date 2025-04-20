#!/usr/bin/env node
/**
 * Simple script to verify that .env file exists and is loaded properly
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n=== ENVIRONMENT VARIABLES VALIDATOR ===\n');

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found at:', envPath);
  console.log('\nYou need to create a .env file in the root directory with your database credentials.');
  console.log('Example content for .env:');
  console.log('DATABASE_URL="postgres://postgres:your_password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require"');
  console.log('SUPABASE_URL=https://your-project-ref.supabase.co');
  console.log('SUPABASE_KEY=your-anon-key');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key\n');
  process.exit(1);
}

console.log('✅ .env file found at:', envPath);

// Check DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in your .env file');
  process.exit(1);
}

// Display masked DATABASE_URL to verify it's loaded properly
const maskedUrl = process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@');
console.log('✅ DATABASE_URL is defined:', maskedUrl);

// Check other key environment variables
const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn('\n⚠️ Some recommended environment variables are missing:');
  missingVars.forEach(v => console.log(`  - ${v}`));
  console.log('\nThese variables are recommended for full functionality, but not required for DB connection.');
}

console.log('\n=== VALIDATION COMPLETE ===');
console.log('Your .env file appears to be loading correctly.');
