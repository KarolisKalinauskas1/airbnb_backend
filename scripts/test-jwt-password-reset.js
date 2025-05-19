/**
 * Test script for JWT-based password reset flow
 * 
 * This script tests the password reset flow using JWT tokens:
 * 1. Generates a JWT password reset token for a user
 * 2. Verifies the token
 * 3. Simulates the password reset process
 * 
 * Usage:
 * node scripts/test-jwt-password-reset.js [email]
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const PasswordResetService = require('../src/shared/services/password-reset.service');
const emailService = require('../src/shared/services/email-service-factory');
const { EmailServiceFactory } = require('../src/shared/services/email-service-factory');
const prisma = require('../src/config/prisma');

// Mock user for testing if no email provided
const testEmail = process.argv[2] || 'test@example.com';

async function testPasswordReset() {
  try {
    console.log(`🔍 Testing password reset flow for email: ${testEmail}`);
      // 1. Find or create a test user
    console.log('Finding user...');
    // Try to find user in both tables since Prisma models might vary
    let user = await prisma.public_users.findFirst({
      where: { email: testEmail }
    });
    
    // If not found, try users table
    if (!user) {
      user = await prisma.users.findFirst({
        where: { email: testEmail }
      });
    }
    
    if (!user) {
      console.log(`User with email ${testEmail} not found. Please provide a valid email.`);
      console.log('Usage: node scripts/test-jwt-password-reset.js [email]');
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.user_id || user.id} (${user.email})`);
    
    // 2. Generate a password reset token
    console.log('Generating password reset token...');
    const resetToken = PasswordResetService.generateResetToken(user);
    console.log(`✅ Token generated: ${resetToken.substring(0, 20)}...`);
      // Show user object details for debugging
    console.log('User object:', {
      id: user.user_id,
      email: user.email,
      properties: Object.keys(user)
    });
    
    // 3. Verify the token
    console.log('Verifying token...');
    const decodedToken = PasswordResetService.verifyResetToken(resetToken);
    
    if (!decodedToken) {
      console.log('❌ Token verification failed!');
      process.exit(1);
    }
    
    // Print decoded token for comparison with user object
    console.log('Decoded token:', decodedToken);
    
    console.log('✅ Token verified successfully!');
    console.log('Token data:', decodedToken);
      // 4. Test sending the email (optional, comment out if not needed)
    const sendEmail = process.argv.includes('--send-email');
    if (sendEmail) {
      console.log('Sending test password reset email...');
      try {
        // Use the imported email service directly
        await emailService.sendPasswordResetEmail(user, resetToken);
        console.log('✅ Password reset email sent successfully!');
      } catch (emailError) {
        console.error('❌ Error sending password reset email:', emailError.message);
        throw emailError;
      }
    } else {
      console.log('Email sending skipped. Use --send-email flag to test email sending.');
    }
    
    console.log('\n🎉 JWT password reset test completed successfully!');
    console.log('Reset URL (for manual testing):');
    console.log(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`);
    
    console.log('\nTo test the full flow:');
    console.log('1. Copy the reset URL above');
    console.log('2. Open it in a browser');
    console.log('3. Enter a new password');
    console.log('4. Submit the form');
    console.log('\nThe /api/auth/update-password endpoint should process the request and update the password.');
  } catch (error) {
    console.error('❌ Error testing password reset:', error);
  } finally {
    // Close Prisma connection
    await prisma.$disconnect();
  }
}

// Run the test
testPasswordReset();
