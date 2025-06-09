#!/usr/bin/env node

// Simple email service test
require('dotenv').config();

console.log('=== Email Service Test ===');
console.log('Current time:', new Date().toISOString());

// Check environment variables
console.log('\n--- Environment Variables ---');
console.log('EMAIL_SERVICE_TYPE:', process.env.EMAIL_SERVICE_TYPE);
console.log('GMAIL_USER:', process.env.GMAIL_USER ? 'Configured' : 'Not configured');
console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? 'Configured (length: ' + process.env.GMAIL_APP_PASSWORD.length + ')' : 'Not configured');
console.log('FROM_EMAIL:', process.env.FROM_EMAIL);

// Test the email service factory
try {
  console.log('\n--- Testing Email Service Factory ---');
  const EmailServiceFactory = require('./src/shared/services/email-service-factory');
  const emailService = EmailServiceFactory.getEmailService();
  console.log('Email service selected:', emailService.constructor.name);
  
  // Test simple gmail service directly
  console.log('\n--- Testing Simple Gmail Service ---');
  const SimpleGmailService = require('./src/shared/services/simple-gmail.service');
  
  // Test email sending with a dummy email
  const testUser = {
    email: '1unobela@gmail.com', // Using the same email as configured
    full_name: 'Test User'
  };
  
  const testBooking = {
    booking_id: 'test-123',
    start_date: '2025-06-01',
    end_date: '2025-06-07'
  };
  
  const testSpot = {
    title: 'Test Camping Spot'
  };
  
  console.log('Testing review request email...');
  SimpleGmailService.sendReviewRequestEmail(testBooking, testUser, testSpot)
    .then(result => {
      console.log('✅ Email test result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Email test error:', error);
      process.exit(1);
    });
    
} catch (error) {
  console.error('❌ Error loading email services:', error);
  process.exit(1);
}
