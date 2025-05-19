/**
 * Integration test for the complete password reset flow
 * This script:
 * 1. Finds a test user
 * 2. Generates a reset token
 * 3. Verifies the token
 * 4. Makes an actual update-password API call
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const PasswordResetService = require('../src/shared/services/password-reset.service');
const prisma = require('../src/config/prisma');
const axios = require('axios');

// Configuration
const API_PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || `http://localhost:${API_PORT}/api`;
const API_BASE_URL = `http://localhost:${API_PORT}`; // Fallback base URL
const TEST_EMAIL = process.argv[2]; // Optional email address from command line
const NEW_PASSWORD = 'TestPassword123!'; // Test password to set

async function testPasswordResetFlow() {
  try {
    console.log('🧪 TESTING COMPLETE PASSWORD RESET FLOW');
    console.log('='.repeat(50));
    
    // Step 1: Find a test user
    console.log('Step 1: Finding a test user...');
    
    let user;
    if (TEST_EMAIL) {
      // Find by email if provided
      user = await prisma.public_users.findFirst({
        where: { 
          email: TEST_EMAIL,
          auth_user_id: { not: null }
        }
      });
    } else {
      // Otherwise find any user with auth_user_id
      user = await prisma.public_users.findFirst({
        where: { 
          auth_user_id: { not: null } 
        }
      });
    }
    
    if (!user) {
      console.error('❌ No suitable test user found');
      process.exit(1);
    }
    
    console.log(`✅ Found test user: ${user.email} (ID: ${user.user_id})`);
    
    // Step 2: Generate a reset token
    console.log('\nStep 2: Generating password reset token...');
    const resetToken = PasswordResetService.generateResetToken(user);
    console.log(`✅ Token generated: ${resetToken.substring(0, 20)}...`);
    
    // Step 3: Verify the token locally
    console.log('\nStep 3: Verifying token locally...');
    const tokenData = PasswordResetService.verifyResetToken(resetToken);
    
    if (!tokenData) {
      console.error('❌ Token verification failed');
      process.exit(1);
    }
    
    console.log('✅ Token verified successfully');
    console.log('Token data:', tokenData);
      // Step 4: Call the password update API
    console.log('\nStep 4: Calling update-password API...');
    try {
      // Prepare the request headers and body
      const headers = {
        'Content-Type': 'application/json'
      };
      
      const payload = {
        password: NEW_PASSWORD,
        token: resetToken
      };
        // Construct the full URL
      const fullUrl = `${API_BASE_URL}/api/auth/update-password`;
      
      console.log(`POST ${fullUrl}`);
      console.log('Request payload:', {
        password: '(hidden)',
        tokenLength: resetToken.length,
        tokenPreview: resetToken.substring(0, 20) + '...'
      });
      
      const response = await axios.post(fullUrl, payload, { headers });
      
      console.log('✅ API response:', response.data);
      
      console.log('\n✅✅ PASSWORD RESET FLOW TEST SUCCESSFUL! ✅✅');
      console.log(`The password for ${user.email} has been updated to "${NEW_PASSWORD}"`);
    } catch (apiError) {
      console.error('❌ API request failed:', apiError.message);
      
      if (apiError.response) {
        console.error('Response status:', apiError.response.status);
        console.error('Response data:', apiError.response.data);
        
        // Print additional debugging information
        console.error('\nDEBUG INFO:');
        console.error('- Token valid locally:', !!tokenData);
        console.error('- User ID:', user.user_id);
        console.error('- Auth User ID:', user.auth_user_id);
      }
      
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error in test flow:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testPasswordResetFlow();
