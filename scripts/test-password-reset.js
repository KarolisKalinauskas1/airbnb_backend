#!/usr/bin/env node

/**
 * Test the Password Reset Email Functionality
 * 
 * This script tests the password reset email functionality by directly calling
 * the email service factory and simulating a password reset request.
 */

require('dotenv').config();
const EmailServiceFactory = require('../src/shared/services/email-service-factory');

// Email to send the test to
const testEmail = process.argv[2] || '1unobela@gmail.com';

console.log(`Testing password reset email functionality...`);
console.log(`Sending password reset email to: ${testEmail}`);

// Create test user
const testUser = {
  email: testEmail,
  full_name: 'Test User'
};

// Generate a reset token
const resetToken = 'test-reset-token-' + Date.now();

// Send a test password reset email
async function sendPasswordResetEmail() {
  try {
    console.log(`\nAttempting to send password reset email via EmailServiceFactory...`);
    console.log(`FROM_EMAIL: ${process.env.FROM_EMAIL}`);
    console.log(`EMAIL_SERVICE_TYPE: ${process.env.EMAIL_SERVICE_TYPE}`);
    
    const result = await EmailServiceFactory.sendPasswordResetEmail(testUser, resetToken);
    
    if (result) {
      console.log('\n✅ Password reset email sent successfully!');
      console.log(`A password reset email was sent to ${testEmail}`);
      console.log(`The reset token is: ${resetToken}`);
      console.log(`Check your email inbox (and spam folder) for the message.`);
    } else {
      console.error('\n❌ Failed to send password reset email.');
      console.error('Please check the logs for more details.');
    }
  } catch (error) {
    console.error('\n❌ Error sending password reset email:', error);
  }
}

// Run the test
sendPasswordResetEmail();
