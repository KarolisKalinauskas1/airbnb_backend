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

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.sub) {
      return res.status(401).json({
        error: 'Invalid Token',
        message: 'Authentication token is invalid'
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
    }

    // Get user from database
    const user = await prisma.public_users.findUnique({
      where: { user_id: decoded.sub },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        status: true
      }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid User',
        message: 'User not found'
      });
    }

    if (user.status === 'INACTIVE') {
      return res.status(403).json({
        error: 'Account Inactive',
        message: 'Your account is currently inactive'
      });
    }

    // Attach user to request
    req.user = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      isowner: Number(user.isowner),
      auth_user_id: decoded.sub
    };

    // Token refresh logic
    const tokenExp = decoded.exp * 1000;
    const now = Date.now();
    const refreshThreshold = 24 * 60 * 60 * 1000; // 24 hours

    if (tokenExp - now < refreshThreshold) {
      const newToken = jwt.sign(
        { sub: user.user_id, email: user.email },
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