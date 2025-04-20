/**
 * Enhanced Authentication Middleware
 * 
 * This middleware handles authentication by verifying Supabase JWT tokens
 * and providing rate limiting functionality to prevent abuse.
 */
const prisma = require('../config/database');
const { authClient } = require('../config/supabase');

// Tracking for rate limiting - prevents abuse
const requestCounts = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

// Check if we're in development mode
const DEV_MODE = process.env.NODE_ENV !== 'production';

/**
 * Authentication middleware
 * Verifies JWT tokens from Supabase and attaches user info to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Basic rate limiting by IP to prevent abuse and infinite loops
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries to prevent memory leaks
    Object.keys(requestCounts).forEach(key => {
      if (now - requestCounts[key].timestamp > RATE_LIMIT_WINDOW) {
        delete requestCounts[key];
      }
    });
    
    // Initialize or increment the counter
    if (!requestCounts[ip]) {
      requestCounts[ip] = { count: 1, timestamp: now };
    } else {
      requestCounts[ip].count++;
    }
    
    // Check if rate limit is exceeded
    if (requestCounts[ip].count > RATE_LIMIT_MAX) {
      console.log(`Rate limit exceeded for IP ${ip}`);
      return res.status(429).json({ 
        error: 'Too many requests, please try again later',
        retryAfter: Math.ceil((requestCounts[ip].timestamp + RATE_LIMIT_WINDOW - now) / 1000)
      });
    }
    
    // Add bypassAuth query param support for development/debugging only
    const bypassAuth = DEV_MODE && req.query.bypassAuth === 'true';
    if (bypassAuth) {
      console.warn('⚠️ Auth bypass detected - this should only be used for development');
      req.supabaseUser = { 
        id: 'bypass-auth-user', 
        email: req.query.email || 'bypass@example.com',
        user_metadata: { full_name: 'Bypass User' }
      };
      return next();
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
    
    // If auth client isn't configured, return error
    if (!authClient) {
      return res.status(503).json({ error: 'Authentication service is not available' });
    }
    
    try {
      // Verify the token with Supabase
      const { data, error } = await authClient.auth.getUser(token);
      
      if (error) {
        console.log('Token validation error:', error);
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      if (!data.user) {
        console.log('No user found for token');
        return res.status(401).json({ error: 'User not found' });
      }
      
      req.supabaseUser = data.user;
      next();
    } catch (authError) {
      console.error('Supabase auth error:', authError);
      
      // Special handling for development environment - allow bypass
      if (DEV_MODE) {
        console.warn('⚠️ Auth failed but allowing access in development mode');
        req.supabaseUser = {
          id: 'mock-user-id',
          email: 'mock@example.com',
          user_metadata: { full_name: 'Mock User' }
        };
        return next();
      }
      
      return res.status(401).json({ error: 'Authentication failed' });
    }
  } catch (err) {
    console.error('Auth middleware - Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { authenticate, prisma };
