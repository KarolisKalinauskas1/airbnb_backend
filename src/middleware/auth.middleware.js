const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { jwtConfig } = require('../config');
const prisma = require('../config/prisma');

// Token cache and blacklist
const tokenCache = new Map();
const tokenBlacklist = new Map();

// Rate limiting for auth requests
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip;
    }
});

// Stricter login rate limiting
const loginRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts, please try again later' }
});

/**
 * Refresh user token with security checks
 */
async function refreshUserToken(oldToken) {
    try {
        // Verify old token ignoring expiration
        const decoded = jwt.verify(oldToken, jwtConfig.secret, { ignoreExpiration: true });
        
        // Check if token is blacklisted
        if (tokenBlacklist.has(oldToken)) {
            throw new Error('Token has been revoked');
        }
        
        // Get user from database
        const user = await prisma.public_users.findUnique({
            where: { email: decoded.email }
        });
        
        if (!user) {
            throw new Error('User not found');
        }
        
        // Generate new token with consistent fields
        const token = jwt.sign(
            {
                sub: user.user_id.toString(),
                user_id: user.user_id,
                email: user.email,
                full_name: user.full_name,
                isowner: Number(user.isowner),
                verified: user.verified
            },
            jwtConfig.secret,
            { expiresIn: '7d' }
        );
        
        // Cache new token
        tokenCache.set(token, {
            userId: user.user_id,
            expiryTime: Date.now() + (7 * 24 * 60 * 60 * 1000)
        });
        
        // Blacklist old token
        tokenBlacklist.set(oldToken, Date.now() + (24 * 60 * 60 * 1000));
        
        return token;
    } catch (error) {
        console.error('Token refresh error:', error);
        return null;
    }
}

/**
 * Enhanced authentication middleware with security checks
 */
const authenticate = async (req, res, next) => {
    try {
        console.log('Auth middleware - headers:', {
            auth: req.headers.authorization ? 'present' : 'missing',
            cookie: req.headers.cookie ? 'present' : 'missing'
        });

        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('Auth middleware - No bearer token found');
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Extract and verify token
        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log('Auth middleware - Empty token');
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Verify token
        try {
            const decoded = jwt.verify(token, jwtConfig.secret);
            console.log('Auth middleware - Token decoded:', {
                subject: decoded.sub,
                email: decoded.email
            });

            // Get fresh user data from database
            const user = await prisma.users.findUnique({
                where: { user_id: parseInt(decoded.sub) }
            });

            if (!user) {
                console.log('Auth middleware - User not found in database:', decoded.email);
                return res.status(401).json({ error: 'User not found' });
            }

            // Attach normalized user object to request
            req.user = {
                user_id: user.user_id,
                email: user.email,
                full_name: user.full_name,
                isowner: Number(user.isowner),
                verified: user.verified
            };

            next();
        } catch (jwtError) {
            console.error('Auth middleware - JWT error:', jwtError);
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
    } catch (error) {
        console.error('Auth middleware - Unexpected error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

/**
 * Revoke a token (add to blacklist)
 */
const revokeToken = (token) => {
    try {
        const decoded = jwt.decode(token);
        const expiryTime = decoded.exp ? decoded.exp * 1000 : Date.now() + (24 * 60 * 60 * 1000);
        tokenBlacklist.set(token, expiryTime);
        tokenCache.delete(token);
    } catch {
        // If token can't be decoded, blacklist it for 24 hours
        tokenBlacklist.set(token, Date.now() + (24 * 60 * 60 * 1000));
    }
};

module.exports = {
    authenticate,
    authRateLimiter,
    loginRateLimiter,
    revokeToken
};
