/**
 * Authentication Debug Routes
 * Endpoints to help debug authentication issues
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import authentication middleware if available
let authenticate;
try {
  authenticate = require('../middleware/auth');
} catch (error) {
  // Fallback if not found in middleware
  try {
    authenticate = require('../middlewares/auth');
  } catch (error) {
    console.warn('Warning: Auth middleware not found, using placeholder');
    authenticate = (req, res, next) => {
      req.authDebug = { error: 'Auth middleware not found' };
      next();
    };
  }
}

/**
 * @route   GET /api/auth-debug
 * @desc    Get debug info about authentication configuration
 * @access  Public (in development)
 */
router.get('/', (req, res) => {
  res.json({
    message: 'Auth debug endpoint operational',
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!(process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY),
      hasSupabaseServiceKey: !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasSessionConfig: !!process.env.SESSION_SECRET
    },
    session: req.session ? {
      exists: true,
      isAuthenticated: !!req.session.userId,
      userId: req.session.userId,
      hasUserId: !!req.session.userId,
      hasEmail: !!req.session.email
    } : {
      exists: false
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/auth-debug/token-info
 * @desc    Get information about the provided token without requiring auth
 * @access  Public
 */
router.get('/token-info', (req, res) => {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({
      error: 'Missing bearer token',
      header: authHeader || 'No Authorization header'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  // Basic token analysis
  const tokenInfo = {
    token: token.substring(0, 10) + '...',
    length: token.length,
    format: {
      hasThreeParts: token.split('.').length === 3,
      isPossibleJwt: token.includes('.') && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token)
    }
  };
  
  // Try to decode the JWT header (without validation)
  try {
    if (tokenInfo.format.isPossibleJwt) {
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      tokenInfo.header = header;
    }
  } catch (error) {
    tokenInfo.decodeError = error.message;
  }
  
  res.json({
    message: 'Token analysis',
    tokenInfo,
    headers: {
      accept: req.headers.accept,
      contentType: req.headers['content-type']
    }
  });
});

/**
 * @route   GET /api/auth-debug/session
 * @desc    Get detailed info about the current session
 * @access  Public (in development)
 */
router.get('/session', (req, res) => {
  if (req.session) {
    res.json({
      hasSession: true,
      userId: req.session.userId,
      email: req.session.email,
      isOwner: req.session.isowner,
      authUserId: req.session.auth_user_id,
      sessionId: req.sessionID,
      cookie: req.session.cookie ? {
        expires: req.session.cookie.expires,
        maxAge: req.session.cookie.maxAge,
        httpOnly: req.session.cookie.httpOnly,
        secure: req.session.cookie.secure
      } : 'No cookie info'
    });
  } else {
    res.json({
      hasSession: false,
      message: 'No session found'
    });
  }
});

/**
 * @route   GET /api/auth-debug/headers
 * @desc    Get info about the request headers
 * @access  Public (in development)
 */
router.get('/headers', (req, res) => {
  res.json({
    hasAuthorization: !!req.headers.authorization,
    authorizationType: req.headers.authorization 
      ? req.headers.authorization.split(' ')[0] 
      : null,
    requestHeaders: {
      accept: req.headers.accept,
      contentType: req.headers['content-type'],
      origin: req.headers.origin,
      host: req.headers.host,
      userAgent: req.headers['user-agent']
    }
  });
});

/**
 * @route   GET /api/auth-debug/users
 * @desc    Count users in database
 * @access  Public (in development)
 */
router.get('/users', async (req, res) => {
  try {
    // Try to count users from different tables
    let counts = {};
    
    try {
      // Try standard users table
      counts.users = await prisma.users.count();
    } catch (e) {
      counts.users = `Error: ${e.message}`;
    }
    
    try {
      // Try public_users table
      counts.public_users = await prisma.public_users.count();
    } catch (e) {
      counts.public_users = `Error: ${e.message}`;
    }
    
    res.json({
      userCounts: counts,
      prismaModels: Object.keys(prisma).filter(key => 
        !key.startsWith('$') && 
        typeof prisma[key] === 'object' &&
        prisma[key] !== null
      )
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/auth-debug/auth-test
 * @desc    Test the authentication process
 * @access  Protected
 */
router.get('/auth-test', authenticate, (req, res) => {
  res.json({
    authenticated: !!req.user,
    user: req.user ? {
      id: req.user.user_id,
      email: req.user.email,
      isowner: req.user.isowner
    } : null,
    authDebug: req.authDebug || {},
    headers: {
      authorization: req.headers.authorization ? 'Present (hidden)' : 'Not present',
      accept: req.headers.accept
    }
  });
});

module.exports = router;
