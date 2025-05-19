/**
 * Test script to verify a specific token from the command line
 * Usage: node check-specific-token.js [token]
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

// Get token from command line or prompt
const token = process.argv[2];

if (!token) {
  console.error('Error: No token provided');
  console.log('Usage: node check-specific-token.js [token]');
  process.exit(1);
}

async function verifyToken(token) {
  console.log('\n🔍 CHECKING TOKEN');
  console.log('-'.repeat(50));
  
  // First try decoding without verification
  try {
    // Split the token
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('❌ Invalid token format - not a valid JWT (should have 3 parts)');
      return;
    }
    
    // Decode header and payload
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    console.log('Token parts without verification:');
    console.log('Header:', header);
    console.log('Payload:', payload);
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error(`❌ Token is expired! Expired at: ${new Date(payload.exp * 1000).toLocaleString()}`);
      console.log(`Current time: ${new Date().toLocaleString()}`);
      console.log(`Time difference: ${Math.floor((now - payload.exp) / 60)} minutes ago`);
    }
    
    // Now verify with JWT
    try {
      // Check for JWT_SECRET
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('❌ JWT_SECRET is not set in environment variables');
        return;
      }
      
      console.log('\nAttempting to verify token signature with JWT_SECRET...');
      const verified = jwt.verify(token, secret);
      console.log('✅ Token verification successful!');
      console.log('Verified payload:', verified);
      
      // If it's a password reset token, check the user
      if (verified.type === 'password-reset' && verified.userId) {
        console.log('\nThis appears to be a password reset token. Checking user...');
        
        // Convert ID to integer if needed
        const userId = parseInt(verified.userId, 10);
        console.log(`Looking for user with ID: ${userId}`);
        
        // Try to find the user
        const user = await prisma.public_users.findUnique({
          where: { user_id: userId }
        });
        
        if (user) {
          console.log('✅ User found:', {
            id: user.user_id,
            email: user.email,
            auth_id: user.auth_user_id ? `${user.auth_user_id.substring(0, 10)}...` : 'missing'
          });
          
          // Check auth_user_id
          if (!user.auth_user_id) {
            console.error('⚠️ User is missing auth_user_id which is required for password reset');
          }
        } else {
          console.error(`❌ No user found with ID ${userId}`);
        }
      }
    } catch (verifyError) {
      console.error('❌ Token signature verification failed:', verifyError.message);
    }
  } catch (decodeError) {
    console.error('❌ Failed to decode token:', decodeError.message);
  }
  
  console.log('-'.repeat(50));
}

// Run the verification
verifyToken(token)
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
