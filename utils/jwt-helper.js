/**
 * JWT helper functions
 */
const jwt = require('jsonwebtoken');

// Get JWT secret from environment or use a fallback
const JWT_SECRET = process.env.JWT_SECRET || 'your-256-bit-secret'; // Use a strong secret in production!

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object from database
 * @param {Object} options - Token options
 * @returns {string} JWT token
 */
function generateToken(user, options = {}) {
  const expiresIn = options.expiresIn || '7d'; // Default to 7 days
  
  const payload = {
    sub: user.user_id.toString(), // sub must be string
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    isowner: Number(user.isowner),
    verified: user.verified
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload or null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Token verification error:', error.message);
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};
