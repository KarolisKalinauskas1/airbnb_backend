/**
 * Enhanced Authentication Middleware
 * 
 * This middleware handles authentication by verifying Supabase JWT tokens
 * and providing rate limiting functionality to prevent abuse.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authClient } = require('../config/supabase');

// Tracking for rate limiting - prevents abuse
const requestCounts = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

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
    
    // Track request count
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
    
    // Extract the token from Authorization header
    const authHeader = req.headers.authorization || '';
    
    if (!authHeader.startsWith('Bearer ')) {
      console.log('Auth middleware - No Bearer token found in Authorization header');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      console.log('Auth middleware - Token not provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify the token with Supabase
    if (!authClient) {
      console.error('Auth middleware - Supabase auth client not initialized');
      return res.status(500).json({ error: 'Auth service unavailable' });
    }
    
    const { data: { user }, error } = await authClient.auth.getUser(token);
    
    if (error) {
      console.log('Auth middleware - Token validation error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (!user) {
      console.log('Auth middleware - No user found for token');
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Set the user for use in the route handlers
    req.supabaseUser = user;
    
    // Add request timestamp for monitoring and debugging
    req.authTimestamp = new Date().toISOString();
    
    // Continue to the next middleware or route handler
    next();
  } catch (err) {
    console.error('Auth middleware - Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { authenticate, prisma };
