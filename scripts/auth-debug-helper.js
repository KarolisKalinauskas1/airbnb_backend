/**
 * Auth Debugging Helper
 * 
 * This script helps diagnose authentication issues by logging the full details
 * of the JWT token and verifying the token is correctly formatted.
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Parse and display token information
 * @param {string} token - JWT token
 * @returns {object} Token data
 */
function decodeAndDisplayToken(token) {
  try {
    // Basic validation
    if (!token) {
      console.error('❌ No token provided');
      return { error: 'No token provided' };
    }
    
    // Remove Bearer prefix if present
    const cleanToken = token.replace('Bearer ', '');
    
    try {
      // Try to verify with our JWT secret
      const verified = jwt.verify(cleanToken, process.env.JWT_SECRET);
      console.log('✅ Token verification SUCCESSFUL');
      console.log(JSON.stringify(verified, null, 2));
      
      // Check expiration
      checkExpiration(verified);
      
      return { verified: true, data: verified };
    } catch (verifyError) {
      console.log(`❌ Token verification FAILED: ${verifyError.message}`);
      
      // Token might still be valid but with wrong secret
      const decoded = jwt.decode(cleanToken, { complete: true });
      if (!decoded) {
        console.error('❌ Not a valid JWT format');
        return { error: 'Invalid token format' };
      }
      
      console.log('📋 Token contents (without verification):');
      console.log(JSON.stringify(decoded, null, 2));
      
      // Check token format and contents
      validateTokenFormat(decoded);
      
      // Check expiration anyway
      if (decoded.payload && decoded.payload.exp) {
        checkExpiration(decoded.payload);
      }
      
      return { verified: false, data: decoded, error: verifyError.message };
    }
  } catch (error) {
    console.error(`❌ Error processing token: ${error.message}`);
    return { error: 'Failed to process token' };
  }
}

/**
 * Check if token is expired
 */
function checkExpiration(payload) {
  if (payload.exp) {
    const expiry = new Date(payload.exp * 1000);
    const now = new Date();
    const timeLeft = expiry - now;
    
    console.log(`⏰ Token expiration: ${expiry.toISOString()}`);
    console.log(`⏰ Current time: ${now.toISOString()}`);
    
    if (expiry > now) {
      console.log(`✅ Token is VALID for another ${Math.round(timeLeft / 1000 / 60)} minutes`);
    } else {
      console.log(`❌ Token is EXPIRED (${Math.abs(Math.round(timeLeft / 1000 / 60))} minutes ago)`);
    }
  } else {
    console.log('⚠️ No expiration found in token');
  }
}

/**
 * Validate token format and contents
 */
function validateTokenFormat(decodedToken) {
  // Check header
  if (!decodedToken.header || !decodedToken.header.alg) {
    console.log('⚠️ Token missing algorithm in header');
  } else {
    console.log(`ℹ️ Token algorithm: ${decodedToken.header.alg}`);
  }
  
  // Check payload
  const payload = decodedToken.payload;
  if (!payload) {
    console.log('❌ Token has no payload');
    return;
  }
  
  // Check essential fields
  console.log('\n📋 Essential fields check:');
  const essentialFields = ['sub', 'iat', 'exp'];
  let missingFields = [];
  
  essentialFields.forEach(field => {
    if (payload[field] === undefined) {
      console.log(`❌ Missing '${field}'`);
      missingFields.push(field);
    } else {
      console.log(`✅ '${field}' present: ${payload[field]}`);
    }
  });
  
  // Check user data
  console.log('\n👤 User data check:');
  if (payload.email) {
    console.log(`✅ Email: ${payload.email}`);
  } else {
    console.log('❌ No email in token');
  }
  
  if (payload.user_id) {
    console.log(`✅ user_id: ${payload.user_id}`);
  } else if (payload.sub) {
    console.log(`ℹ️ Using 'sub' as user ID: ${payload.sub}`);
  } else {
    console.log('❌ No user identifier in token');
  }
}

// Run as script
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Please provide a JWT token as an argument');
    process.exit(1);
  }
  
  decodeAndDisplayToken(args[0]);
}

module.exports = { decodeAndDisplayToken };
