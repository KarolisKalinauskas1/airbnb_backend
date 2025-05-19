#!/usr/bin/env node

/**
 * Direct Test for Simple Gmail Service
 * 
 * This script directly tests the SimpleGmailService by importing it and sending a test email.
 */

require('dotenv').config();

// Import the Simple Gmail service
const SimpleGmailService = require('../src/shared/services/simple-gmail.service');

// Test email recipient
const recipientEmail = process.argv[2] || '1unobela@gmail.com';

console.log('====================================');
console.log('Simple Gmail Service Direct Test');
console.log('====================================');
console.log(`GMAIL_USER: ${process.env.GMAIL_USER}`);
console.log(`GMAIL_APP_PASSWORD set: ${process.env.GMAIL_APP_PASSWORD ? 'Yes' : 'No'}`);
console.log(`FROM_EMAIL: ${process.env.FROM_EMAIL}`);
console.log(`Sending test email to: ${recipientEmail}`);
console.log('====================================');

// Send a simple test email
async function sendTestEmail() {
  try {
    const subject = 'Simple Gmail Service Test';
    const text = `This is a test email sent at ${new Date().toISOString()}.`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #2a5934;">Simple Gmail Service Test</h2>
        <p>This is a test email sent at ${new Date().toISOString()}.</p>
        <p>If you're seeing this email, the Simple Gmail Service is working correctly!</p>
      </div>
    `;

    console.log('Sending test email...');
    const result = await SimpleGmailService.sendEmail(recipientEmail, subject, text, html);
    
    if (result) {
      console.log('\n✅ Test email sent successfully!');
    } else {
      console.error('\n❌ Failed to send test email.');
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

// Run the test
sendTestEmail();
