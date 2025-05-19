#!/usr/bin/env node

/**
 * Test the Simple Gmail Service
 * 
 * This script sends a test email using the SimpleGmailService to verify it works correctly.
 */

require('dotenv').config();
const SimpleGmailService = require('../src/shared/services/simple-gmail.service');

// Email to send the test to
const testEmail = process.argv[2] || '1unobela@gmail.com';

console.log(`Testing email service with SimpleGmailService...`);
console.log(`Sending test email to: ${testEmail}`);
console.log(`Using GMAIL_USER: ${process.env.GMAIL_USER}`);
console.log(`APP_PASSWORD configured: ${process.env.GMAIL_APP_PASSWORD ? 'Yes' : 'No'}`);

// Create test user
const testUser = {
  email: testEmail,
  full_name: 'Test User'
};

// Send a test email
async function sendTestEmail() {
  try {
    console.log('\nSending test password reset email...');
    const result = await SimpleGmailService.sendPasswordResetEmail(testUser, 'test-token-' + Date.now());
    
    if (result) {
      console.log('\n✅ Test email sent successfully!');
      console.log('Check your email inbox (and spam folder) for the test email.');
    } else {
      console.error('\n❌ Failed to send test email.');
      console.error('Check the logs above for error details.');
    }
  } catch (error) {
    console.error('\n❌ Error during test:', error);
  }
}

// Run the test
sendTestEmail();
