#!/usr/bin/env node

/**
 * Debug Environment Variables
 * 
 * This script outputs all environment variables that are loaded from the .env file
 * to debug email configuration issues.
 */

require('dotenv').config();

console.log('====================================');
console.log('DEBUG: ENVIRONMENT VARIABLES');
console.log('====================================');

// Email-specific environment variables
const emailVars = [
  'FROM_EMAIL',
  'EMAIL_SERVICE_TYPE',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN'
];

emailVars.forEach(varName => {
  const value = process.env[varName];
  
  if (varName.includes('PASSWORD') || varName.includes('SECRET') || varName.includes('KEY')) {
    // For sensitive variables, don't show the full value
    console.log(`${varName}: ${value ? '[SET]' : '[NOT SET]'}`);
    if (value) {
      console.log(`  Length: ${value.length} chars`);
      console.log(`  First 4 chars: ${value.substring(0, 4)}...`);
    }
  } else {
    // For non-sensitive variables, show the full value
    console.log(`${varName}: ${value || '[NOT SET]'}`);
  }
});

console.log('====================================');
