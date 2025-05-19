/**
 * Script to manually send a password reset email
 * 
 * This script sends an actual password reset email to a user
 * for testing the complete reset flow.
 * 
 * Usage: 
 * node scripts/send-password-reset.js <email>
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const prisma = require('../src/config/prisma');
const PasswordResetService = require('../src/shared/services/password-reset.service');
const EmailServiceFactory = require('../src/shared/services/email-service-factory');

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.error('❌ Email address is required');
  console.log('Usage: node scripts/send-password-reset.js <email>');
  process.exit(1);
}

async function sendPasswordReset() {
  try {
    console.log(`🔍 Finding user with email: ${email}`);
    
    // Try to find the user
    const user = await prisma.users.findFirst({
      where: { email }
    });
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.user_id} (${user.email})`);
    
    // Generate a reset token
    console.log('Generating password reset token...');
    const resetToken = PasswordResetService.generateResetToken(user);
    
    // Get the configured email service
    const EmailService = EmailServiceFactory.getEmailService();
    
    // Send the password reset email
    console.log('Sending password reset email...');
    await EmailService.sendPasswordResetEmail(user, resetToken);
    
    console.log(`✅ Password reset email sent to ${email}`);
    console.log('\nEmail contains a link to:');
    console.log(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=<JWT_TOKEN>`);
    
    console.log('\nWhen the user clicks this link:');
    console.log('1. Frontend shows password reset form');
    console.log('2. User enters new password');
    console.log('3. Frontend sends JWT token + new password to backend');
    console.log('4. Backend verifies token and updates password');
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
sendPasswordReset();
