const rateLimit = require('express-rate-limit');
const { prisma } = require('../config');
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
    let error = null;

    // First try Supabase token
    try {
      console.log('Auth middleware - Trying Supabase token...');
      const { data: { user: supabaseUser }, error: supabaseError } = await supabase.auth.getUser(token);
      if (supabaseUser) {
        user = supabaseUser;
      } else {
        error = supabaseError;
      }
    } catch (supabaseError) {
      console.log('Auth middleware - Supabase token failed, trying custom token...');
      error = supabaseError;
    }

    // If Supabase token failed, try custom token
    if (!user) {
      try {
        console.log('Auth middleware - Verifying custom token...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.user_id) {
          // Get user from database
          const publicUser = await prisma.public_users.findUnique({
            where: { user_id: decoded.user_id }
          });
          
          if (publicUser) {
            user = {
              id: publicUser.auth_user_id,
              email: publicUser.email,
              user_metadata: { isowner: publicUser.isowner }
            };
          }
        }
      } catch (jwtError) {
        console.error('Auth middleware - Custom token verification failed:', jwtError);
        error = jwtError;
      }
    }

    if (!user) {
      console.error('Auth middleware - All token verification attempts failed:', error);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    console.log('Auth middleware - Token verified successfully');

    // Get user from database
    console.log('Auth middleware - Fetching user from database...');
    const publicUser = await prisma.public_users.findFirst({
      where: {
        auth_user_id: user.id
      }
    });

    if (!publicUser) {
      console.log('Auth middleware - User profile not found');
      return res.status(404).json({ error: 'User profile not found' });
    }
    console.log('Auth middleware - User found in database');

    // Log the raw data before constructing the user object
    console.log('Auth middleware - Raw user data:', {
      supabaseUser: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata
      },
      publicUser: {
        user_id: publicUser.user_id,
        auth_user_id: publicUser.auth_user_id,
        isowner: publicUser.isowner
      }
    });

    // Construct the user object carefully
    const userObject = {
      // Supabase user data
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
      
      // Public user data
      user_id: publicUser.user_id,
      auth_user_id: publicUser.auth_user_id,
      isowner: Number(publicUser.isowner) || 0
    };

    // Validate the constructed user object
    if (!userObject.user_id) {
      console.error('Auth middleware - Invalid user object: missing user_id');
      return res.status(400).json({ error: 'Invalid user data: missing user_id' });
    }

    if (typeof userObject.isowner === 'undefined') {
      console.error('Auth middleware - Invalid user object: missing isowner');
      return res.status(400).json({ error: 'Invalid user data: missing isowner' });
    }

    // Attach user to request
    req.user = userObject;
    console.log('Auth middleware - Authentication successful');
    next();
  } catch (error) {
    console.error('Auth middleware - Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

module.exports = {
  authenticate,
  authRateLimiter
}; 