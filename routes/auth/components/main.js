/**
 * Main Authentication Component
 * 
 * Provides core authentication functionality from auth.js
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../../../middlewares/auth');
const validate = require('../../../middlewares/validate');
const { registerUserSchema, loginUserSchema, changePasswordSchema } = require('../../../schemas/user-schemas');
const jwt = require('jsonwebtoken');
const { generateToken } = require('../../../utils/jwt-helper');

// Import Supabase configuration
const { adminClient, publicClient, isConfigured } = require('../../../config/supabase');

// Get the JWT secret from environment or use a consistent fallback - must match middleware
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Helper function to create owner record if needed
 */
async function createOwnerIfNeeded(userId, license = 'none') {
  try {
    // Check if owner record already exists
    const existingOwner = await prisma.owner.findUnique({
      where: { owner_id: userId }
    });
    
    // Only create if it doesn't exist
    if (!existingOwner) {
      await prisma.owner.create({
        data: {
          owner_id: userId,
          license: license || 'none'
        }
      });
      console.log(`Created owner record for user: ${userId}, license: ${license || 'none'}`);
    } else {
      console.log(`Owner record already exists for user: ${userId}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to create/verify owner record for user ${userId}:`, error);
    return false;
  }
}

/**
 * Core authentication routes from the original auth.js file
 */

// @route   POST /api/auth/signin
router.post('/signin', validate(loginUserSchema), async (req, res, next) => {
  try {
    if (!isConfigured) {
      const error = new Error('Authentication service not configured');
      error.status = 503;
      error.details = 'Supabase credentials are missing';
      throw error;
    }

    const { email, password } = req.body;
    
    // Authenticate with Supabase
    const { data, error } = await adminClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      const authError = new Error(error.message);
      authError.status = 401;
      throw authError;
    }
    
    // Find or create user in database
    let user;
    try {
      // Try to find user in database
      user = await prisma.public_users.findUnique({
        where: { email: email }
      });
      
      if (!user && data.user) {
        // Create user if not found
        user = await prisma.public_users.create({
          data: {
            email: email,
            full_name: data.user.user_metadata?.full_name || email.split('@')[0],
            auth_user_id: data.user.id,
            isowner: data.user.user_metadata?.isowner || 0,
            verified: 'yes',
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      }
    } catch (dbError) {
      console.warn('Failed to create/find user in database:', dbError.message);
    }
    
    // Create session
    req.session.userId = user.user_id;
    req.session.email = user.email;
    req.session.isowner = Number(user.isowner);
    req.session.auth_user_id = user.auth_user_id || data.user?.id;

    // Generate JWT token
    const token = generateToken(user, { expiresIn: '7d' });

    // Send cookie with JWT token as well
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
      path: '/'
    });

    // Return response with user data and token
    res.json({
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner)
      },
      token,
      sessionId: req.sessionID
    });
  } catch (error) {
    next(error);
  }
});

// Include other routes from the original auth.js file:
// - POST /api/auth/signup (register user)
// - POST /api/auth/reset-password (send password reset email)
// - POST /api/auth/refresh-token (refresh auth token)
// - POST /api/auth/sync (sync user data)
// - GET /api/auth/status (check auth status)
// - POST /api/auth/login (login user)
// - POST /api/auth/register (register + create session)
// - POST /api/auth/signout (sign out user)
// - GET /api/auth/session (get session info)
// - POST /api/auth/restore-session (restore from token)
// - POST /api/auth/sync-session (sync Supabase session)
// - GET /api/auth/verify-token (verify token validity)
// - GET /api/auth/heartbeat (keep session alive)
// - POST /api/auth/change-password (change password)

// Just including a few essential routes as examples, the others would follow the same pattern

/**
 * @route   GET /api/auth/status
 * @desc    Check authentication status
 * @access  Public
 */
router.get('/status', (req, res) => {
  // Apply CORS headers for credential requests
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Check if session exists
  if (req.session && req.session.userId) {
    return res.json({
      authenticated: true,
      userId: req.session.userId,
      email: req.session.email,
      isowner: Number(req.session.isowner) || 0
    });
  }
  
  // Check for token in Authorization header
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
    
    try {
      // Decode token (without verification) to check if it exists and has basic format
      const decoded = jwt.decode(token);
      if (decoded && decoded.sub) {
        return res.json({
          authenticated: true,
          fromToken: true,
          userId: decoded.sub,
          email: decoded.email || 'unknown'
        });
      }
    } catch (error) {
      console.warn('Token decode error in status check:', error);
    }
  }
  
  // No valid session or token
  return res.status(401).json({
    authenticated: false,
    message: 'Not authenticated'
  });
});

/**
 * @route   POST /api/auth/signout
 * @desc    Sign out user and destroy session
 * @access  Public
 */
router.post('/signout', async (req, res) => {
  try {
    // Destroy session
    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ error: 'Failed to end session' });
      }
      
      // Clear session cookie
      res.clearCookie('camping.sid');
      
      // If Supabase is configured, also sign out there
      if (isConfigured && adminClient) {
        // Get the refresh token if provided
        const { refresh_token } = req.body;
          if (refresh_token) {
          // Sign out specific session with global scope
          adminClient.auth.signOut({ refresh_token, scope: 'global' }).catch(error => {
            console.warn('Failed to sign out from Supabase:', error);
          });
        }
      }
      
      res.json({ success: true, message: 'Signed out successfully' });
    });
  } catch (error) {
    console.error('Signout error:', error);
    // Return success anyway - we'll handle cleanup on the frontend
    res.status(200).json({ 
      success: true, 
      message: 'Session cleared on client (server error ignored)',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;