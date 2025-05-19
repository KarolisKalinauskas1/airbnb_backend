/**
 * Password Reset Service using stateless JWT tokens
 * 
 * This service provides token generation and validation for password resets
 * without requiring database storage.
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class PasswordResetService {  /**
   * Generate a password reset token for a user
   * @param {Object} user - The user object
   * @returns {String} - A signed JWT token
   */  static generateResetToken(user) {
    // Check for required properties
    if (!user || (!user.user_id && !user.id) || !user.email) {
      console.error('Invalid user object for token generation:', user);
      throw new Error('Invalid user object');
    }
    
    // Create a unique token ID to prevent replay attacks
    const tokenId = crypto.randomBytes(16).toString('hex');
    
    // Create JWT payload - use user_id if available, otherwise fall back to id
    const userId = user.user_id || user.id;
    
    // Convert userId to string for JWT payload
    const userIdStr = userId.toString();
    
    const payload = {
      userId: userIdStr,
      email: user.email,
      tokenId,
      type: 'password-reset'
    };
    
    // Sign with JWT secret and set expiration to 1 hour
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });
    
    return token;
  }
    /**
   * Verify a password reset token
   * @param {String} token - The JWT token to verify
   * @returns {Object|null} - The decoded token payload or null if invalid
   */
  static verifyResetToken(token) {
    try {
      console.log('Verifying token:', token ? `${token.substring(0, 20)}...` : 'null');
      
      if (!token) {
        console.error('Token is null or undefined');
        return null;
      }
      
      // Verify JWT signature and expiration
      const secret = process.env.JWT_SECRET;
      console.log('Using JWT_SECRET:', secret ? `${secret.substring(0, 10)}...` : 'missing');
      
      const decoded = jwt.verify(token, secret);
      console.log('Token decoded successfully:', decoded);
      
      // Verify token type
      if (decoded.type !== 'password-reset') {
        console.error('Invalid token type:', decoded.type);
        return null;
      }
      
      return {
        userId: decoded.userId,
        email: decoded.email,
        tokenId: decoded.tokenId
      };
    } catch (error) {
      console.error('Token verification failed:', error.message);
      console.error('Token parts:', token ? token.split('.').length : 'invalid token');
      
      // Try to decode the payload part without verification to see what's inside
      try {
        if (token && token.split('.').length === 3) {
          const [header, payload, signature] = token.split('.');
          const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
          console.log('Payload without verification:', decodedPayload);
          
          // Check if token is expired
          if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
            console.error('Token expired at:', new Date(decodedPayload.exp * 1000).toISOString());
            console.error('Current time:', new Date().toISOString());
          }
        }
      } catch (decodeErr) {
        console.error('Failed to decode token parts:', decodeErr);
      }
      
      return null;
    }
  }
}

module.exports = PasswordResetService;
