#!/usr/bin/env node

/**
 * Email Service Test Script
 * 
 * This script tests the email service configuration and sends a test email.
 * Usage: node scripts/test-email-service.js [options]
 * 
 * Options:
 *   --provider=<provider>  Force the use of a specific provider (mailgun, gmail)
 *   --debug                Show detailed debug information
 *   --to=<email>           Send test email to this address (default: uses .env TEST_EMAIL or admin email)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Try importing the email service factory first (if exists)
let EmailService;
try {
  EmailService = require('../src/shared/services/email-service-factory');
  console.log('✅ Using Email Service Factory');
} catch (error) {
  // Fall back to standard email service
  try {
    EmailService = require('../src/shared/services/email.service');
    console.log('✅ Using standard Email Service');
  } catch (error) {
    console.error('❌ Failed to import email service:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  provider: null,
  debug: false,
  to: process.env.TEST_EMAIL || 'test@example.com'
};

args.forEach(arg => {
  if (arg.startsWith('--provider=')) {
    options.provider = arg.split('=')[1];
  } else if (arg === '--debug') {
    options.debug = true;
  } else if (arg.startsWith('--to=')) {
    options.to = arg.split('=')[1];
  }
});

// If provider is specified, temporarily override the environment variable
if (options.provider) {
  console.log(`🔄 Forcing email provider: ${options.provider}`);
  process.env.EMAIL_SERVICE_TYPE = options.provider;
}

// Debug log environment variables
if (options.debug) {
  console.log('\n📋 Email Configuration:');
  console.log('- EMAIL_SERVICE_TYPE:', process.env.EMAIL_SERVICE_TYPE || 'auto');
  console.log('- MAILGUN_API_KEY:', process.env.MAILGUN_API_KEY ? `${process.env.MAILGUN_API_KEY.substring(0, 8)}...` : 'not set');
  console.log('- MAILGUN_DOMAIN:', process.env.MAILGUN_DOMAIN || 'not set');
  console.log('- FROM_EMAIL:', process.env.FROM_EMAIL || 'not set');
  console.log('- GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID ? `${process.env.GMAIL_CLIENT_ID.substring(0, 8)}...` : 'not set');
  console.log('- GMAIL_CLIENT_SECRET:', process.env.GMAIL_CLIENT_SECRET ? 'set [hidden]' : 'not set');
  console.log('- GMAIL_REFRESH_TOKEN:', process.env.GMAIL_REFRESH_TOKEN ? 'set [hidden]' : 'not set');
}

// Create mock user for testing
const mockUser = {
  email: options.to,
  full_name: 'Test User',
  id: 'test-user-id'
};

// Create mock reset token for password reset
const mockResetToken = 'test-reset-token-' + Date.now();

// Display test info
console.log(`\n📧 Sending test email to: ${mockUser.email}`);

// Run the test
async function runTest() {
  try {
    // Test password reset email
    console.log('\n🔍 Testing password reset email...');
    const passwordResetResult = await EmailService.sendPasswordResetEmail(mockUser, mockResetToken);
    console.log(passwordResetResult ? '✅ Password reset email sent successfully' : '❌ Failed to send password reset email');

    // Test welcome email
    console.log('\n🔍 Testing welcome email...');
    const welcomeResult = await EmailService.sendWelcomeEmail(mockUser);
    console.log(welcomeResult ? '✅ Welcome email sent successfully' : '❌ Failed to send welcome email');

    // Display summary
    console.log('\n📊 Test Summary:');
    console.log('- Password Reset Email:', passwordResetResult ? 'Success' : 'Failed');
    console.log('- Welcome Email:', welcomeResult ? 'Success' : 'Failed');
    
    if (!passwordResetResult || !welcomeResult) {
      console.log('\n⚠️ Some tests failed. Check the logs for details.');
    } else {
      console.log('\n🎉 All tests passed successfully!');
    }
    
    process.exit(passwordResetResult && welcomeResult ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

runTest();
