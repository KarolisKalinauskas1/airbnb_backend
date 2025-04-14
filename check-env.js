/**
 * Environment Variable Checker Script
 * 
 * Run this script with: node check-env.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n=======================================');
console.log('ENVIRONMENT VARIABLE CHECKER');
console.log('=======================================\n');

// Define required variables
const requiredVars = {
  'SUPABASE_URL': 'Your Supabase project URL (e.g., https://xxxxxxxxxxxx.supabase.co)',
  'SUPABASE_KEY': 'Your Supabase anonymous/public API key',
  'STRIPE_SECRET_KEY': 'Your Stripe secret key'
};

// Optional but recommended variables
const recommendedVars = {
  'FRONTEND_URL': 'URL of your frontend app (default: http://localhost:5173)',
  'DATABASE_URL': 'Connection string for your database (if not using Supabase connection)'
};

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ ERROR: .env file not found!\n');
  console.log('Please create a .env file in this directory with the following variables:');
  
  console.log('\nRequired variables:');
  Object.entries(requiredVars).forEach(([key, description]) => {
    console.log(`  ${key}=          # ${description}`);
  });
  
  console.log('\nRecommended variables:');
  Object.entries(recommendedVars).forEach(([key, description]) => {
    console.log(`  ${key}=          # ${description}`);
  });
  
  console.log('\nExample .env file:');
  console.log('------------------');
  Object.keys(requiredVars).forEach(key => {
    console.log(`${key}=your_${key.toLowerCase()}_here`);
  });
  Object.keys(recommendedVars).forEach(key => {
    console.log(`${key}=your_${key.toLowerCase()}_here`);
  });
  console.log('------------------\n');
  process.exit(1);
}

console.log('✅ .env file found');

// Check required variables
let missingRequired = false;
console.log('\nChecking required variables:');
Object.keys(requiredVars).forEach(key => {
  if (!process.env[key]) {
    console.log(`❌ ${key} is missing`);
    missingRequired = true;
  } else {
    const value = process.env[key];
    // Show first few characters and mask the rest
    const maskedValue = value.substring(0, 4) + '...' + value.substring(value.length - 4);
    console.log(`✅ ${key}=${maskedValue}`);
  }
});

if (missingRequired) {
  console.log('\n⚠️ Some required environment variables are missing!');
  console.log('Please add them to your .env file and restart the server.');
  process.exit(1);
}

// Check recommended variables
let missingRecommended = false;
console.log('\nChecking recommended variables:');
Object.keys(recommendedVars).forEach(key => {
  if (!process.env[key]) {
    console.log(`⚠️ ${key} is not set (optional)`);
    missingRecommended = true;
  } else {
    console.log(`✅ ${key} is set`);
  }
});

// Test Supabase connection
console.log('\nTesting Supabase connection:');
try {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  
  console.log('✅ Supabase client created successfully');
  console.log('  URL: ' + process.env.SUPABASE_URL);
  
  // Attempting a simple query to verify the connection
  console.log('\nAttempting to retrieve Supabase authentication configuration...');
  console.log('(This will verify if your API key has the correct permissions)');
  
  // Use an async IIFE to allow for await
  (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      console.log('✅ Successfully connected to Supabase!');
    } catch (error) {
      console.error('❌ Failed to connect to Supabase:', error.message);
      console.log('\n⚠️ Check that your SUPABASE_URL and SUPABASE_KEY are correct.');
    }
    
    console.log('\n=======================================');
    console.log('Environment check completed');
    if (missingRecommended) {
      console.log('⚠️ Some recommended variables are missing, but the application can still function.');
    } else if (!missingRequired) {
      console.log('✅ All environment variables are properly configured!');
    }
    console.log('=======================================\n');
  })();
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error.message);
  console.log('\n⚠️ Check that @supabase/supabase-js is installed and your environment variables are correct.');
}
