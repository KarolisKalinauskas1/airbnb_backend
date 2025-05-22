const rateLimit = require('express-rate-limit');

// Base rate limiter configuration
const createLimiter = (options) => rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // Default: 15 minutes
    max: options.max || 100, // Default: 100 requests per windowMs
    message: { error: options.message || 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip;
    },
    skip: (req) => process.env.NODE_ENV === 'development'
});

// Payment endpoints rate limiter
const paymentLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per 15 minutes
    message: 'Too many payment attempts, please try again in 15 minutes'
});

// Authentication rate limiter
const authLimiter = createLimiter({
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 20, // 20 requests per 30 minutes
    message: 'Too many authentication attempts, please try again in 30 minutes'
});

// API rate limiter
const apiLimiter = createLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // 100 requests per 5 minutes
    message: 'Too many API requests, please try again in 5 minutes'
});

module.exports = {
    paymentLimiter,
    authLimiter,
    apiLimiter
};
