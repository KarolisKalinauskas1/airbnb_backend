/**
 * Test script to verify JWT token signing and verification
 * This script helps debug JWT-based password reset token issues
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const jwt = require('jsonwebtoken');

function testJwtFunctionality() {
  console.log('Testing JWT functionality...');

  // Check if JWT_SECRET is set
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET is not set in environment variables!');
    process.exit(1);
  }

  console.log(`JWT_SECRET is set (${secret.substring(0, 10)}...)`);
  
  // Create a payload
  const payload = {
    userId: '1',
    email: 'test@example.com',
    type: 'password-reset',
    tokenId: '12345'
  };
  
  try {
    // Sign the token
    console.log('Signing token...');
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    console.log(`Token generated: ${token.substring(0, 20)}...`);
    
    // Verify the token
    console.log('Verifying token...');
    const decoded = jwt.verify(token, secret);
    console.log('Token verification successful!');
    console.log('Decoded payload:', decoded);
    
    // Demonstrate what happens with an invalid secret
    console.log('\nTesting with wrong secret (should fail)...');
    try {
      jwt.verify(token, 'wrong-secret');
      console.error('ERROR: Verification succeeded with wrong secret! This should not happen.');
    } catch (err) {
      console.log('Expected verification error with wrong secret:', err.message);
    }
    
    console.log('\nAll JWT tests passed successfully!');
  } catch (error) {
    console.error('JWT test failed:', error);
    process.exit(1);
  }
}

testJwtFunctionality();
