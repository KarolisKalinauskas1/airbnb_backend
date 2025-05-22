const rateLimit = require('express-rate-limit');
const { redisStore, isRedisConnected } = require('../config/redis');

// Create limiter with either Redis or memory store
const createLimiter = (options) => {
  const config = {
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes default
    max: options.max || 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too Many Requests',
      message: options.message || 'Please try again later',
      retryAfter: options.windowMs / 1000
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use X-Forwarded-For header if available (for proxies)
      return req.get('X-Forwarded-For') || req.ip;
    },
    skip: (req) => {
      // Skip rate limiting for whitelisted IPs
      const whitelistedIPs = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
      return whitelistedIPs.includes(req.ip);
    }
  };
  // Use Redis store if available and connected
  if (redisStore && isRedisConnected()) {
    config.store = redisStore;
  }

  return rateLimit(config);
};

// API-wide rate limiter
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});

// More restrictive auth limiter
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts'
});

// Strict payment limiter
const paymentLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many payment attempts'
});

// Upload limiter
const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many file uploads'
});

module.exports = {
  apiLimiter,
  authLimiter,
  paymentLimiter,
  uploadLimiter,
  createLimiter
};
