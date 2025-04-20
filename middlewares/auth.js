const { prisma } = require('../config/database');
const { authClient, isConfigured } = require('../config/supabase');

// Tracking for rate limiting - prevents abuse
const requestCounts = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

// Check if we're in development mode
const DEV_MODE = process.env.NODE_ENV !== 'production';

/**
 * Authentication middleware
 * Verifies JWT tokens and attaches the user to the request object
 */
const authenticate = async (req, res, next) => {
  try {
    // Basic rate limiting
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    Object.keys(requestCounts).forEach(key => {
      if (now - requestCounts[key].timestamp > RATE_LIMIT_WINDOW) {
        delete requestCounts[key];
      }
    });
    
    // Initialize or increment counter
    if (!requestCounts[ip]) {
      requestCounts[ip] = { count: 1, timestamp: now };
    } else {
      requestCounts[ip].count++;
    }
    
    // Check rate limit
    if (requestCounts[ip].count > RATE_LIMIT_MAX) {
      return res.status(429).json({ 
        error: 'Too many requests, please try again later',
        retryAfter: Math.ceil((requestCounts[ip].timestamp + RATE_LIMIT_WINDOW - now) / 1000)
      });
    }
    
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Check if auth client is configured
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not available',
        details: 'Supabase authentication is not properly configured'
      });
    }
    
    // Verify the token with Supabase
    const { data: { user }, error } = await authClient.auth.getUser(token);
    
    if (error) {
      console.log('Token validation error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Attach user to request
    req.supabaseUser = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { authenticate };
