const rateLimit = require('express-rate-limit');
const prisma = require('../../../config/prisma');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Rate limit settings for auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

/**
 * Optional authentication middleware - doesn't require authentication
 * but will populate req.user if a valid token is provided
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    let user = null;
    
    // Get token from authorization header or session
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    try {
      if (token) {
        // Verify JWT token
        const decoded = jwt.verify(token, jwtConfig.secret);
        const dbUser = await prisma.public_users.findUnique({
          where: { user_id: decoded.sub }
        });
        
        if (dbUser) {
          user = {
            user_id: dbUser.user_id,
            email: dbUser.email,
            full_name: dbUser.full_name,
            isowner: dbUser.isowner === '1' ? '1' : '0'
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
        isowner: user.isowner
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
    console.log('Auth middleware - Headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Not present',
      cookie: req.headers.cookie ? 'Present' : 'Not present'
    });
    
    // Get token from Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      console.log('Auth middleware - No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, jwtConfig.secret);
        // Find user in database by email
      const user = await prisma.public_users.findUnique({
        where: { email: decoded.email },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true
        }
      });
      
      if (!user) {
        console.error('Auth middleware - User not found for token:', decoded);
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Ensure user_id is numeric and isowner is string '1' or '0'
      req.user = {
        user_id: parseInt(user.user_id),
        email: user.email,
        full_name: user.full_name,
        isowner: user.isowner === '1' ? '1' : '0'
      };
      
      console.log('Auth middleware - Authentication successful for user:', req.user.email);
      next();
    } catch (jwtError) {
      console.error('Auth middleware - JWT error:', jwtError.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Auth middleware - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

module.exports = {
  authenticate,
  authRateLimiter,
  optionalAuthenticate
};