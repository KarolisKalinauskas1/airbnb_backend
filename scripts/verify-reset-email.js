/**
 * End-to-End Password Reset Test Script
 * 
 * This script:
 * 1. Takes an email address as input
 * 2. Sends a real password reset email
 * 3. Extracts and formats the reset URL for testing
 * 
 * Usage: node verify-reset-email.js <email@example.com>
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const prisma = require('../src/config/prisma');
const PasswordResetService = require('../src/shared/services/password-reset.service');
const emailService = require('../src/shared/services/email-service-factory');

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error('Please provide an email address');
  console.error('Usage: node verify-reset-email.js <email@example.com>');
  process.exit(1);
}

async function runTest() {
  console.log(`🧪 TESTING PASSWORD RESET EMAIL FLOW FOR ${email}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Find the user by email
    console.log('Step 1: Finding user...');
    const user = await prisma.public_users.findUnique({
      where: { email }
    });
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.email} (ID: ${user.user_id})`);
    
    // Step 2: Generate a reset token
    console.log('\nStep 2: Generating password reset token...');
    const resetToken = PasswordResetService.generateResetToken(user);
    
    if (!resetToken) {
      console.error('❌ Failed to generate reset token');
      process.exit(1);
    }
    
    console.log(`✅ Token generated: ${resetToken.substring(0, 20)}...`);
    
    // Step 3: Send the email
    console.log('\nStep 3: Sending password reset email...');
    
    // Construct the reset URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    
    console.log(`Reset URL will be: ${resetUrl}`);
    
    // Send the actual email
    const result = await emailService.sendPasswordResetEmail(user, resetToken);
    
    if (!result) {
      console.error('❌ Failed to send password reset email');
      process.exit(1);
    }
    
    console.log('✅ Password reset email sent successfully');
    
    // Step 4: Provide testing instructions
    console.log('\n📧 CHECK YOUR EMAIL');
    console.log('='.repeat(60));
    console.log('1. Check your email inbox for the password reset link');
    console.log('2. Click the link or copy it to your browser');
    console.log('3. You should be redirected to the password reset page');
    console.log('4. Enter a new password and submit the form');
    console.log('5. Try to log in with your new password');
    
    console.log('\n🔍 MANUAL VERIFICATION');
    console.log('='.repeat(60));
    console.log('If you want to manually verify the reset token:');
    console.log(`1. Visit: http://localhost:3000/password-reset-test.html`);
    console.log(`2. Enter your email: ${email}`);
    console.log(`3. Click "Send Reset Email"`);
    console.log('4. Check your inbox for the reset email');
    console.log('5. Copy the JWT token from the URL');
    console.log('6. Paste it into the "Reset Token" field');
    console.log('7. Enter a new password');
    console.log('8. Click "Test Reset Token"');
    console.log('9. Verify the login with your new password');
    
  } catch (error) {
    console.error('❌ Error in password reset email test:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
