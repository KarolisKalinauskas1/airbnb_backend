/**
 * JWT Token Debugging Tool
 * 
 * This script helps diagnose JWT token issues by decoding tokens
 * without verifying signatures - useful for debugging token format problems.
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');

function decodeToken(token) {
  try {
    // First try standard verification
    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ TOKEN VERIFIED SUCCESSFULLY:');
      console.log(JSON.stringify(verified, null, 2));
      return { verified: true, decoded: verified };
    } catch (verifyError) {
      console.log('❌ TOKEN VERIFICATION FAILED:', verifyError.message);
      
      // Try decoding without verification
      const decoded = jwt.decode(token, { complete: true });
      console.log('📋 TOKEN CONTENTS (without verification):');
      console.log(JSON.stringify(decoded, null, 2));
      
      // Check expiration
      if (decoded && decoded.payload && decoded.payload.exp) {
        const expiry = new Date(decoded.payload.exp * 1000);
        const now = new Date();
        console.log(`Token expiration: ${expiry.toISOString()}`);
        console.log(`Current time: ${now.toISOString()}`);
        console.log(`Token ${expiry > now ? 'is still valid' : 'has EXPIRED'}`);
      }
      
      return { verified: false, decoded: decoded, error: verifyError.message };
    }
  } catch (error) {
    console.error('Failed to decode token:', error);
    return { error: 'Invalid token format' };
  }
}

// Main function to process a token
function processToken(tokenString) {
  const token = tokenString.replace('Bearer ', '').trim();
  return decodeToken(token);
}

// If running from command line
if (require.main === module) {
  const tokenArg = process.argv[2];
  
  if (!tokenArg) {
    console.log('Please provide a JWT token as an argument');
    process.exit(1);
  }
  
  processToken(tokenArg);
}

module.exports = { decodeToken, processToken };
