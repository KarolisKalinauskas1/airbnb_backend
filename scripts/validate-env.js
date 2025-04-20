#!/usr/bin/env node
/**
 * Validates the .env file for required variables
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Check if .env file exists
const envPath = path.join(__dirname, '../.env');
const envExists = fs.existsSync(envPath);

console.log('========= ENV VALIDATOR =========\n');
console.log(`.env file ${envExists ? 'exists' : 'DOES NOT EXIST'}`);

if (!envExists) {
  console.error('You need to create a .env file in the project root directory');
  console.log('Example content:');
  console.log('DATABASE_URL="postgres://postgres:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require"');
  console.log('SUPABASE_URL="https://your-project-ref.supabase.co"');
  console.log('SUPABASE_KEY="your-anon-key"');
  console.log('SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

// Check required variables
const requiredVars = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_KEY'
];

const missingVars = [];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    missingVars.push(varName);
  }
}

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.log('\nPlease add these to your .env file');
  process.exit(1);
}

// Display masked values to verify they're loaded
console.log('Environment variables loaded:');
for (const varName of requiredVars) {
  const value = process.env[varName];
  const maskedValue = value.length > 10 
    ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
    : '[HIDDEN]';
  console.log(`✅ ${varName}=${maskedValue}`);
}

// Check DATABASE_URL for port 6543
if (process.env.DATABASE_URL.includes(':6543/')) {
  console.log('\n⚠️ Warning: Your DATABASE_URL is using port 6543, which is often blocked on corporate/school networks.');
  console.log('   Try running: npm run test-ports');
  console.log('   This will test alternative ports like 5432, 5433, etc.');
}

console.log('\n✅ Environment validation successful.');
