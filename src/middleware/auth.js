const rateLimit = require('express-rate-limit');
const prisma = require('../config/prisma');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Ensure JWT secret is properly set
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. This is a critical security issue.');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Enhanced rate limiting configuration
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
  skip: (req) => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    // Use X-Forwarded-For if available (for proxy support)
    return req.headers['x-forwarded-for'] || req.ip;
  }
});

// Different rate limits for different endpoints
const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  'Too many authentication attempts, please try again later'
);

const loginRateLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  5, // 5 failed attempts
  'Too many failed login attempts, please try again later'
);

const passwordResetLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // 3 attempts
  'Too many password reset attempts, please try again later'
);

// Token blacklist (for logged out tokens)
const tokenBlacklist = new Set();

/**
 * Optional authentication middleware - doesn't require authentication
 * but will populate req.user if a valid token is provided
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    console.log('Optional Auth middleware - Authorization header:', authHeader ? 'Present' : 'Missing');
    
    // If no auth header, just continue without authentication
    if (!authHeader) {
      console.log('Optional Auth middleware - No authorization header, continuing as public access');
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    // If no token, just continue without authentication
    if (!token) {
      console.log('Optional Auth middleware - Invalid token format, continuing as public access');
      return next();
    }

    let user = null;
    let decoded = null;

    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      console.log('Optional Auth middleware - Token is blacklisted, continuing as public access');
      return next();
    }

    // Try verifying as JWT token
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded) {
        // Get user from database using email from token
        const dbUser = await prisma.public_users.findUnique({
          where: { 
            email: decoded.email 
          }
        });
        
        if (dbUser) {
          user = {
            user_id: dbUser.user_id,
            email: dbUser.email,
            full_name: dbUser.full_name,
            isowner: dbUser.isowner
          };
          console.log('Optional Auth middleware - User found in database:', user.email);
        }
      }
    } catch (jwtError) {
      console.log('Optional Auth middleware - JWT verification failed, continuing as public access');
      // Continue as public access on JWT error
    }

    // If we found a user, attach to request
    if (user) {
      req.user = {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner) || 0
      };
      console.log('Optional Auth middleware - Authentication successful for user:', req.user.email);
    } else {
      console.log('Optional Auth middleware - Continuing as public access (no valid user)');
    }
    
    next();
  } catch (error) {
    console.log('Optional Auth middleware - Error:', error.message);
    // Continue even if there's an error
    next();
  }
};

/**
 * Authentication middleware
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    console.log('Auth middleware - Authorization header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader) {
      console.log('Auth middleware - No authorization header');
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];
    console.log('Auth middleware - Token extracted:', token ? 'Yes' : 'No');
    
    if (!token) {
      console.log('Auth middleware - Invalid token format');
      return res.status(401).json({ error: 'Invalid authorization token format' });
    }

    let user = null;
    let decoded = null;

    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      console.error('Auth middleware - Token is blacklisted');
      return res.status(401).json({ error: 'Token is invalid or has been revoked' });
    }

    // Try verifying as JWT token
    try {
      console.log('Auth middleware - Verifying JWT token');
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Auth middleware - JWT verification successful, decoded:', decoded);
      
      if (decoded) {
        // Get user from database using email from token
        const dbUser = await prisma.public_users.findUnique({
          where: { 
            email: decoded.email 
          }
        });
        
        if (dbUser) {
          user = {
            user_id: dbUser.user_id,
            email: dbUser.email,
            full_name: dbUser.full_name,
            isowner: dbUser.isowner
          };
          console.log('Auth middleware - User found in database:', user.email);
        } else {
          console.log('Auth middleware - User not found in database for email:', decoded.email);
        }
      }
    } catch (jwtError) {
      console.error('Auth middleware - JWT verification failed:', jwtError.message);
      
      // If JWT fails, try Supabase token as fallback
      try {
        console.log('Auth middleware - Trying Supabase token as fallback');
        const { data: { user: supabaseUser }, error: supabaseError } = await supabase.auth.getUser(token);
        
        if (supabaseUser) {
          // Find the corresponding user in our database
          const dbUser = await prisma.public_users.findFirst({
            where: {
              email: supabaseUser.email
            }
          });
          
          if (dbUser) {
            user = {
              user_id: dbUser.user_id,
              email: dbUser.email,
              full_name: dbUser.full_name,
              isowner: dbUser.isowner
            };
            console.log('Auth middleware - Supabase user found in database:', user.email);
          } else {
            console.log('Auth middleware - Supabase user not found in database for email:', supabaseUser.email);
          }
        }
      } catch (supabaseError) {
        console.error('Auth middleware - Supabase token verification failed:', supabaseError);
      }
    }

    if (!user) {
      console.error('Auth middleware - Authentication failed: User not found');
      return res.status(401).json({ error: 'Invalid token or user not found' });
    }

    // Attach user to request
    req.user = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      isowner: Number(user.isowner) || 0
    };
    
    console.log('Auth middleware - Authentication successful for user:', req.user.email);
    next();
  } catch (error) {
    console.error('Auth middleware - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

module.exports = {
  authenticate,
  authRateLimiter,
  optionalAuthenticate,
  loginRateLimiter,
  passwordResetLimiter
};