const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { jwtConfig, verifyToken } = require('../config');

// Token storage with automatic cleanup
const tokenCache = new Map();
const tokenBlacklist = new Map();

// Cleanup expired tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [token, expiryTime] of tokenBlacklist.entries()) {
        if (now > expiryTime) {
            tokenBlacklist.delete(token);
        }
    }
    for (const [token, data] of tokenCache.entries()) {
        if (now > data.expiryTime) {
            tokenCache.delete(token);
        }
    }
}, 15 * 60 * 1000); // Clean up every 15 minutes

// Enhanced rate limiting with IP tracking
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        // Use X-Forwarded-For if behind a proxy, otherwise use IP
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
        
        // Generate new token
        const token = jwt.sign(
            { 
                sub: user.user_id,
                email: user.email,
                isowner: Number(user.isowner)
            },
            jwtConfig.secret,
            jwtConfig.options
        );
        
        // Cache new token
        tokenCache.set(token, {
            userId: user.user_id,
            expiryTime: Date.now() + (24 * 60 * 60 * 1000)
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
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Invalid authorization token format' });
        }

        // Check blacklist first
        if (tokenBlacklist.has(token)) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        try {
            // Use enhanced token verification
            const decoded = await verifyToken(token);
            
            // Get user from database
            const dbUser = await prisma.public_users.findUnique({
                where: { email: decoded.email }
            });
            
            if (!dbUser) {
                return res.status(401).json({ error: 'User not found' });
            }

            // Attach verified user data to request
            req.user = {
                user_id: dbUser.user_id,
                email: dbUser.email,
                full_name: dbUser.full_name,
                isowner: Number(dbUser.isowner) || 0,
                token_type: 'jwt'
            };
            
            next();
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                try {
                    const newToken = await refreshUserToken(token);
                    if (newToken) {
                        res.set('X-New-Token', newToken);
                        // Verify new token and continue
                        const decoded = await verifyToken(newToken);
                        const dbUser = await prisma.public_users.findUnique({
                            where: { email: decoded.email }
                        });
                        
                        if (dbUser) {
                            req.user = {
                                user_id: dbUser.user_id,
                                email: dbUser.email,
                                full_name: dbUser.full_name,
                                isowner: Number(dbUser.isowner) || 0,
                                token_type: 'jwt'
                            };
                            return next();
                        }
                    }
                    return res.status(401).json({ error: 'Token expired and refresh failed' });
                } catch (refreshError) {
                    return res.status(401).json({ error: 'Token expired and refresh failed' });
                }
            }
            return res.status(401).json({ error: jwtError.message || 'Invalid token' });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Internal server error during authentication' });
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
