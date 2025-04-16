const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import proper Supabase client for authentication
const { authClient } = require('../config/supabase');

// Add request tracking for rate limiting
const requestCounts = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

/**
 * Authentication middleware
 * Verifies JWT tokens and attaches the user to the request object
 */
const authenticate = async (req, res, next) => {
  try {
    // Basic rate limiting
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
    
    // Extract and validate token
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'Missing token' });
    }

    // Verify the token with Supabase
    const { data: { user }, error } = await authClient.auth.getUser(token);
    
    if (error) {
      console.log('Token validation error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (!user) {
      console.log('No user found for token');
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Set the user for use in the route handlers
    req.supabaseUser = user;
    req.authTimestamp = new Date().toISOString(); // Add a timestamp for monitoring
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { authenticate, prisma };
