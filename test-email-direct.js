const SimpleGmailService = require('./src/shared/services/simple-gmail.service');

async function testEmail() {
  try {
    console.log('=== TESTING EMAIL SERVICE ===');
    
    // Test basic email
    const testUser = {
      email: '1unobela@gmail.com',
      full_name: 'Test User'
    };
    
    const testBooking = {
      booking_id: 'TEST-123',
      start_date: '2025-06-01',
      end_date: '2025-06-07'
    };
    
    const testSpot = {
      title: 'Test Camping Spot',
      name: 'Test Camping Spot'
    };
    
    console.log('Sending test review request email...');
    const result = await SimpleGmailService.sendReviewRequestEmail(testBooking, testUser, testSpot);
    console.log('Email result:', result);
    
    if (result) {
      console.log('✅ Email sent successfully!');
    } else {
      console.log('❌ Email failed to send');
    }
    
  } catch (error) {
    console.error('Error testing email:', error.message);
    console.error('Stack:', error.stack);
  }
}

testEmail();
