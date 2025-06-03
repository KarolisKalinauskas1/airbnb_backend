const rateLimit = require('express-rate-limit');

// Base rate limiter configuration
const createLimiter = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip;
    }
});

// General API rate limiter
const apiLimiter = createLimiter(
    15 * 60 * 1000, // 15 minutes
    100,            // 100 requests per windowMs
    'Too many requests, please try again later'
);

// Stricter auth rate limiter
const authLimiter = createLimiter(
    15 * 60 * 1000, // 15 minutes
    50,             // 50 requests per windowMs
    'Too many authentication attempts, please try again later'
);

// Very strict login/register rate limiter
const strictAuthLimiter = createLimiter(
    60 * 60 * 1000, // 1 hour
    5,              // 5 attempts per hour
    'Too many login attempts, please try again in an hour'
);

// Payment endpoints rate limiter
const paymentLimiter = createLimiter(
    60 * 60 * 1000, // 1 hour
    10,             // 10 payment attempts per hour
    'Too many payment attempts, please try again later'
);

module.exports = {
    apiLimiter,
    authLimiter,
    strictAuthLimiter,
    paymentLimiter
};
