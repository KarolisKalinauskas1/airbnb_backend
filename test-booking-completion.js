#!/usr/bin/env node

// Test script to manually run booking completion process
require('dotenv').config();

const BookingCompletionService = require('./src/shared/services/booking-completion.service');
const BookingReviewService = require('./src/shared/services/booking-review.service');

async function testBookingCompletion() {
  console.log('=== Testing Booking Completion Process ===');
  console.log('Current date:', new Date().toISOString());
  
  console.log('\n--- Environment Variables Check ---');
  console.log('EMAIL_SERVICE_TYPE:', process.env.EMAIL_SERVICE_TYPE);
  console.log('GMAIL_USER:', !!process.env.GMAIL_USER ? 'Configured' : 'Not configured');
  console.log('GMAIL_APP_PASSWORD:', !!process.env.GMAIL_APP_PASSWORD ? 'Configured' : 'Not configured');
  console.log('FROM_EMAIL:', process.env.FROM_EMAIL);
  
  try {
    console.log('\n--- Testing BookingCompletionService.processCompletedBookings() ---');
    const completionResult = await BookingCompletionService.processCompletedBookings();
    console.log('Completion result:', completionResult);
    
    console.log('\n--- Testing BookingReviewService.sendReviewRequestEmails() ---');
    const reviewResult = await BookingReviewService.sendReviewRequestEmails();
    console.log('Review emails result:', reviewResult);
    
  } catch (error) {
    console.error('Error during testing:', error);
  }
  
  console.log('\n=== Test Complete ===');
  process.exit(0);
}

testBookingCompletion();
