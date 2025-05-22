const rateLimit = require('express-rate-limit');
const prisma = require('../config/prisma');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const { RedisStore } = require('../config/redis');

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

// Enhanced authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Get token from different possible sources
    const token = (
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.token ||
      req.body?.token
    );

    if (!token) {
      return res.status(401).json({
        error: 'Authentication Required',
        message: 'No authentication token provided'
      });
    }

    // Verify token with detailed error handling
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT Verification Error:', {
        error: jwtError.message,
        name: jwtError.name,
        token: token.substring(0, 10) + '...'
      });
      
      return res.status(401).json({
        error: 'Invalid Token',
        message: `Authentication token is invalid: ${jwtError.message}`
      });
    }

    if (!decoded || !decoded.sub) {
      console.error('Decoded token missing sub field:', decoded);
      return res.status(401).json({
        error: 'Invalid Token',
        message: 'Authentication token is missing required fields'
      });
    }

    // Check token in blacklist if using Redis
    if (RedisStore) {
      const isBlacklisted = await RedisStore.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return res.status(401).json({
          error: 'Token Revoked',
          message: 'This token has been revoked'
        });
      }
    }    // Get user from database
    let user;
    try {
      // First try to fetch user by auth_user_id (UUID from Supabase)
      user = await prisma.public_users.findFirst({
        where: { auth_user_id: decoded.sub },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          verified: true
        }
      });
      
      // If user not found by auth_user_id, try by email as fallback
      if (!user && decoded.email) {
        user = await prisma.public_users.findUnique({
          where: { email: decoded.email },
          select: {
            user_id: true,
            email: true,
            full_name: true,
            isowner: true,
            verified: true
          }
        });
        
        // If we found user by email but auth_user_id is not set, update it
        if (user) {
          try {
            await prisma.public_users.update({
              where: { user_id: user.user_id },
              data: { auth_user_id: decoded.sub }
            });
            console.log(`Updated auth_user_id for user: ${user.email}`);
          } catch (updateError) {
            console.error('Failed to update auth_user_id:', updateError);
          }
        }
      }
    } catch (dbError) {
      console.error('Database error fetching user:', {
        authUserId: decoded.sub, 
        error: dbError.message
      });
      
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to retrieve user data from database'
      });
    }    if (!user) {
      // For security and robustness, we might still let certain endpoints proceed
      // with limited access by setting a basic user object from token data
      const isPublicEndpoint = req.path.startsWith('/api/public/') || 
                              req.path === '/api/health' ||
                              req.path === '/health';
                              
      if (isPublicEndpoint) {
        req.user = {
          user_id: null,
          auth_user_id: decoded.sub,
          email: decoded.email || 'unknown',
          authenticated: true,
          isPublicAccess: true
        };
        console.log('Public endpoint access granted with limited user data');
        return next();
      }
      
      console.warn('User not found for auth ID:', decoded.sub);
      return res.status(401).json({
        error: 'Invalid User',
        message: 'User not found in database'
      });
    }

    // Check if account is verified/active
    if (user.verified === 'false' || user.verified === '0') {
      return res.status(403).json({
        error: 'Account Not Verified',
        message: 'Your account is not verified'
      });    }    // Attach user to request
    req.user = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      isowner: user.isowner === '1' ? '1' : '0',
      verified: user.verified,
      auth_user_id: decoded.sub  // This is the Supabase UUID
    };    // Token refresh logic
    const tokenExp = decoded.exp * 1000;
    const now = Date.now();
    const refreshThreshold = 24 * 60 * 60 * 1000; // 24 hours

    if (tokenExp - now < refreshThreshold) {
      // Create a new token with the auth_user_id (Supabase UUID) in the sub claim
      const newToken = jwt.sign(
        { 
          sub: decoded.sub, // Keep the original Supabase UUID
          email: user.email,
          name: user.full_name 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.set('X-New-Token', newToken);
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid Token',
        message: 'Authentication token is malformed'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token Expired',
        message: 'Authentication token has expired'
      });
    }

    next(error);
  }
};

// Optional authentication middleware
const optionalAuthenticate = async (req, res, next) => {
  try {
    await authenticate(req, res, (err) => {
      if (err && err.status !== 401) {
        next(err);
      } else {
        next();
      }
    });
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  authRateLimiter,
  optionalAuthenticate,
  loginRateLimiter,
  passwordResetLimiter
};