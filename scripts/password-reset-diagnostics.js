/**
 * Comprehensive diagnostic tool for the JWT-based password reset system
 * Tests JWT functionality, token generation, verification, and database connectivity
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

async function runDiagnostics() {
  console.log('========================================');
  console.log('JWT PASSWORD RESET SYSTEM DIAGNOSTICS');
  console.log('========================================');
  
  // Step 1: Check environment variables
  checkEnvironmentVariables();
  
  // Step 2: Test JWT signing and verification
  testJwtFunctionality();
  
  // Step 3: Test token creation and verification end-to-end
  await testTokenEndToEnd();
  
  console.log('========================================');
  console.log('DIAGNOSTICS COMPLETED');
  console.log('========================================');
  
  // Close Prisma connection
  await prisma.$disconnect();
}

function checkEnvironmentVariables() {
  console.log('\n📋 CHECKING ENVIRONMENT VARIABLES');
  console.log('----------------------------------------');
  
  // Check JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('❌ JWT_SECRET is not set in environment variables!');
  } else {
    console.log(`✅ JWT_SECRET is configured (${jwtSecret.substring(0, 10)}...)`);
  }
  
  // Check Supabase configuration
  const supabaseConfigured = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;
  if (!supabaseConfigured) {
    console.error('❌ Supabase configuration is incomplete or missing!');
  } else {
    console.log('✅ Supabase appears to be configured properly');
  }
  
  // Check frontend URL
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    console.warn('⚠️ FRONTEND_URL is not set - defaulting to http://localhost:5173');
  } else {
    console.log(`✅ FRONTEND_URL is set to ${frontendUrl}`);
  }
  
  // Check email configuration
  const emailServiceType = process.env.EMAIL_SERVICE_TYPE;
  console.log(`✅ Email service type: ${emailServiceType || 'auto'}`);
  
  console.log('----------------------------------------');
}

function testJwtFunctionality() {
  console.log('\n🔑 TESTING JWT FUNCTIONALITY');
  console.log('----------------------------------------');
  
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('❌ Cannot test JWT - JWT_SECRET not set');
    return;
  }
  
  try {
    // Create a test payload
    const payload = {
      userId: '1',
      email: 'test@example.com',
      type: 'password-reset',
      tokenId: Date.now().toString()
    };
    
    // Sign the token
    console.log('Signing token with payload:', payload);
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    console.log(`✅ Token signed successfully: ${token.substring(0, 20)}...`);
    
    // Verify the token
    console.log('Verifying token...');
    const decoded = jwt.verify(token, secret);
    console.log('✅ Token verified successfully');
    console.log('Decoded payload:', decoded);
    
    console.log('----------------------------------------');
    return token;
  } catch (error) {
    console.error(`❌ JWT test failed: ${error.message}`);
    console.error(error);
    console.log('----------------------------------------');
    return null;
  }
}

async function testTokenEndToEnd() {
  console.log('\n🔄 TESTING COMPLETE TOKEN FLOW');
  console.log('----------------------------------------');
  
  // Step 1: Simulate token creation for a test user or real user
  try {
    // Get a test user or create one
    console.log('Finding a test user...');
    
    // Get a random user from the database
    const user = await prisma.public_users.findFirst({
      where: {
        auth_user_id: {
          not: null
        }
      }
    });
    
    if (!user) {
      console.error('❌ No users found in the database');
      return;
    }
    
    console.log(`✅ Found test user: ${user.email} (ID: ${user.user_id})`);
    
    // Load the PasswordResetService
    const PasswordResetService = require('../src/shared/services/password-reset.service');
    
    // Generate a token for this user
    console.log('Generating password reset token...');
    const resetToken = PasswordResetService.generateResetToken(user);
    console.log(`✅ Token generated: ${resetToken.substring(0, 20)}...`);
    
    // Verify the token
    console.log('Verifying generated token...');
    const tokenData = PasswordResetService.verifyResetToken(resetToken);
    
    if (tokenData) {
      console.log('✅ Token verified successfully');
      console.log('Token data:', tokenData);
      
      // Check if the user ID in the token matches the user's ID
      const userIdInt = parseInt(tokenData.userId, 10);
      if (userIdInt === user.user_id) {
        console.log('✅ User ID in token matches the database user ID');
      } else {
        console.error(`❌ User ID mismatch: Token has ${userIdInt}, user has ${user.user_id}`);
      }
      
      // Generate a reset URL that would be sent to users
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
      console.log('✅ Reset URL would be:');
      console.log(resetUrl);
    } else {
      console.error('❌ Token verification failed');
    }
    
    console.log('----------------------------------------');
  } catch (error) {
    console.error(`❌ End-to-end test failed: ${error.message}`);
    console.error(error);
    console.log('----------------------------------------');
  }
}

// Run the diagnostics
runDiagnostics();
