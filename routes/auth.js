const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { registerUserSchema, loginUserSchema, changePasswordSchema } = require('../schemas/user-schemas');
const jwt = require('jsonwebtoken');
const { generateToken } = require('../utils/jwt-helper');

// Import Supabase configuration
const { adminClient, publicClient, isConfigured } = require('../config/supabase');

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
 * @route   POST /api/auth/signin
 * @desc    Sign in with email/password
 * @access  Public
 */
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

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', validate(registerUserSchema), async (req, res, next) => {
  try {
    if (!isConfigured) {
      const error = new Error('Authentication service not configured');
      error.status = 503;
      error.details = 'Supabase credentials are missing';
      throw error;
    }

    const { email, password, full_name } = req.body;
    
    // Create user in Supabase
    const { data, error } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name }
      }
    });
    
    if (error) throw error;
    
    // Create user in our database if Supabase signup was successful
    if (data?.user) {
      try {
        const newUser = await prisma.public_users.create({
          data: {
            email,
            full_name: full_name || email.split('@')[0],
            auth_user_id: data.user.id,
            verified: 'no',
            isowner: '0',
            created_at: new Date(),
            updated_at: new Date()
          }
        });
        
        res.status(201).json({
          message: 'User registered successfully',
          user: {
            id: newUser.user_id,
            email: newUser.email,
            fullName: newUser.full_name
          }
        });
      } catch (dbError) {
        // If DB creation fails, delete the Supabase user
        try {
          await adminClient.auth.admin.deleteUser(data.user.id);
        } catch {}
        
        throw dbError;
      }
    } else {
      const error = new Error('Failed to create user');
      error.status = 500;
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/reset-password', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }

    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const { error } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
    });
    
    if (error) throw error;
    
    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh authentication token
 * @access  Public
 */
router.post('/refresh-token', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }

    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    const { data, error } = await adminClient.auth.refreshSession({ refresh_token });
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * @route   POST /api/auth/sync
 * @desc    Sync user data between Supabase and database
 * @access  Private
 */
router.post('/sync', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured', 
        details: 'Supabase credentials are missing'
      });
    }
    
    // Get authenticated user
    const userId = req.user.user_id;
    const authUserId = req.user.auth_user_id;
    
    if (!authUserId) {
      return res.status(400).json({ 
        error: 'Sync failed',
        message: 'User is missing auth_user_id' 
      });
    }
    
    // Get user data from Supabase
    const { data, error } = await adminClient.auth.admin.getUserById(authUserId);
    
    if (error) throw error;
    
    if (!data.user) {
      return res.status(404).json({ 
        error: 'Supabase user not found',
        message: 'User exists in database but not in Supabase' 
      });
    }
    
    // Extract user metadata
    const metadata = data.user.user_metadata || {};
    const fullName = metadata.full_name || req.user.full_name;
    const isOwner = typeof metadata.isowner !== 'undefined' ? metadata.isowner : req.user.isowner;
    
    // Update user in our database
    await prisma.public_users.update({
      where: { user_id: userId },
      data: {
        full_name: fullName,
        isowner: isOwner,
        updated_at: new Date()
      }
    });
    
    // Get updated user
    const updatedUser = await prisma.public_users.findUnique({
      where: { user_id: userId }
    });
    
    res.json({ 
      message: 'User data synchronized successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('User sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
 * @route   POST /api/auth/login
 * @desc    Login user and return session
 * @access  Public
 */
router.post('/login', validate(loginUserSchema), async (req, res, next) => {
  try {
    if (!isConfigured) {
      const error = new Error('Authentication service not configured');
      error.status = 503;
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

/**
 * @route   POST /api/auth/register
 * @desc    Register user and create session (unified registration endpoint)
 * @access  Public
 */
router.post('/register', validate(registerUserSchema), async (req, res, next) => {
  try {
    console.log('\n\n==== POST /api/auth/register ENDPOINT CALLED ====');
    console.log('Registration endpoint called with data:', { 
      email: req.body.email,
      has_password: !!req.body.password,
      full_name: req.body.full_name,
      is_seller: req.body.is_seller
    });
    
    if (!isConfigured) {
      console.log('ERROR: Supabase is not configured');
      const error = new Error('Authentication service not configured');
      error.status = 503;
      throw error;
    }

    const { email, password, full_name, is_seller, license } = req.body;
    
    // Check if user already exists in the database
    console.log('Checking if user already exists in public_users table...');
    const existingUser = await prisma.public_users.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      console.log('User already exists in public_users table:', existingUser.user_id);
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    console.log('Creating user in Supabase...');
    // Create user in Supabase
    const { data, error } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: { 
          full_name,
          isowner: is_seller ? 1 : 0
        }
      }
    });
    
    if (error) {
      console.error('Supabase signup error:', error);
      throw error;
    }
    
    if (!data?.user) {
      console.error('No user data returned from Supabase');
      const error = new Error('Failed to create user in authentication service');
      error.status = 500;
      throw error;
    }
    
    console.log('Supabase user created successfully, ID:', data.user.id);
    
    // Create user in our database
    let user;
    try {
      console.log('Creating user in public_users table...');
      console.log('Data for new user:', {
        email,
        full_name,
        auth_user_id: data.user.id,
        isowner: is_seller ? '1' : '0'
      });
      
      user = await prisma.public_users.create({
        data: {
          email,
          full_name: full_name || email.split('@')[0],
          auth_user_id: data.user.id,
          verified: 'no',
          isowner: is_seller ? '1' : '0',
          created_at: new Date(),
          updated_at: new Date()
        }
      });
      
      console.log('User created in public_users table, ID:', user.user_id);
      
      // Create owner record if needed
      if (is_seller) {
        console.log('Creating owner record...');
        await createOwnerIfNeeded(user.user_id, license);
      }
      
      // Create session
      req.session.userId = user.user_id;
      req.session.email = user.email;
      req.session.isowner = user.isowner;
      req.session.auth_user_id = user.auth_user_id;
      
      console.log('Registration successful, session created, user ID:', user.user_id);
      console.log('Registration successful, returning response');
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          isowner: Number(user.isowner) || 0
        },
        session: {
          userId: user.user_id,
          email: user.email,
          authenticated: true
        }
      });
    } catch (dbError) {
      // If DB creation fails, delete the Supabase user
      console.error('Database error during registration:', dbError);
      console.error('Error details:', dbError.stack);
      console.error('Prisma error code:', dbError.code);
      console.error('Prisma error meta:', dbError.meta);
      
      try {
        console.log('Cleaning up Supabase user after DB error...');
        await adminClient.auth.admin.deleteUser(data.user.id);
        console.log('Supabase user deleted successfully');
      } catch (deleteError) {
        console.error('Failed to clean up Supabase user after DB error:', deleteError);
      }
      
      // Check if this is a unique constraint violation (user already exists)
      if (dbError.code === 'P2002') {
        return res.status(400).json({ 
          error: 'User with this email already exists',
          details: 'A user with this email is already registered'
        });
      }
      
      throw dbError;
    }
  } catch (error) {
    console.error('Registration error:', error);
    
    if (!res.headersSent) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ 
        error: 'Registration failed',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
      });
    }
    
    next(error);
  }
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
          // Sign out specific session
          adminClient.auth.signOut({ refresh_token }).catch(error => {
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

/**
 * @route   GET /api/auth/session
 * @desc    Get current session information
 * @access  Public
 */
router.get('/session', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({
      authenticated: true,
      userId: req.session.userId,
      email: req.session.email,
      isowner: parseInt(req.session.isowner) || 0
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

/**
 * @route   POST /api/auth/restore-session
 * @desc    Restore session from token
 * @access  Public
 */
router.post('/restore-session', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    // Verify the token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Find the user
      const user = await prisma.public_users.findUnique({
        where: { 
          user_id: decoded.id || decoded.sub 
        }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Create a session
      req.session.userId = user.user_id;
      req.session.email = user.email;
      req.session.isowner = Number(user.isowner) || 0;
      
      // Return the authenticated user info
      return res.json({
        authenticated: true,
        user: {
          user_id: user.user_id,
          email: user.email,
          isowner: Number(user.isowner) || 0
        }
      });
    } catch (tokenError) {
      console.error('Token verification failed:', tokenError);
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Session restoration error:', error);
    return res.status(500).json({ error: 'Session restoration failed' });
  }
});

/**
 * @route   POST /api/auth/sync-session
 * @desc    Sync Supabase session with our backend - SIMPLIFIED VERSION
 * @access  Public
 */
router.post('/sync-session', async (req, res) => {
  try {
    // Apply CORS headers for credential requests
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    
    // Check if session already exists - fast path return to avoid DB queries
    if (req.session && req.session.userId) {
      return res.json({
        authenticated: true,
        userId: req.session.userId,
        email: req.session.email,
        isowner: Number(req.session.isowner) || 0
      });
    }
    
    // Get token from request body
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        authenticated: false,
        error: 'Missing token' 
      });
    }
    
    // Keep the session verification very simple for this endpoint to reduce timeouts
    try {
      // Just decode the token without full verification to make this super fast
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.sub) {
        return res.status(401).json({ 
          authenticated: false,
          error: 'Invalid token format' 
        });
      }
      
      // Set basic session data without DB lookups to improve performance
      req.session.userId = decoded.sub;
      req.session.email = decoded.email || '';
      req.session.auth_user_id = decoded.sub;
      
      // Extract isowner from user_metadata if available
      if (decoded.user_metadata && decoded.user_metadata.isowner !== undefined) {
        req.session.isowner = decoded.user_metadata.isowner;
      }
      
      return res.json({
        authenticated: true,
        userId: decoded.sub,
        email: decoded.email || '',
        isowner: Number(req.session.isowner) || 0,
        // Don't include sensitive data in the response
        sessionRestored: true
      });
    } catch (tokenError) {
      console.warn('Token decode error:', tokenError.message);
      return res.status(401).json({
        authenticated: false, 
        error: 'Invalid token'
      });
    }
  } catch (error) {
    console.error('Session sync error:', error);
    return res.status(500).json({
      authenticated: false,
      error: 'Session sync failed'
    });
  }
});

/**
 * @route   GET /api/auth/verify-token
 * @desc    Verify if a token is valid (lightweight endpoint)
 * @access  Public
 */
router.get('/verify-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, message: 'No token provided' });
    }
    
    // Extract the token
    const token = authHeader.split(' ')[1];
    
    // Verify the token - keeping this lightweight, we're just checking
    // if it's a valid JWT, not doing full verification
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: false });
      return res.json({ valid: true, tokenInfo: { sub: decoded.sub } });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ valid: false, message: 'Token expired' });
      }
      return res.status(401).json({ valid: false, message: 'Invalid token' });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ valid: false, message: 'Internal error' });
  }
});

/**
 * @route   GET /api/auth/heartbeat
 * @desc    Keep session alive and verify authentication
 * @access  Private
 */
router.get('/heartbeat', authenticate, (req, res) => {
  // If the authenticate middleware passed, the user is authenticated
  res.json({
    authenticated: true,
    timestamp: new Date().toISOString(),
    userId: req.user.user_id
  });
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password (requires current password)
 * @access  Private
 */
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req, res, next) => {
  try {
    if (!isConfigured) {
      const error = new Error('Authentication service not configured');
      error.status = 503;
      error.details = 'Supabase credentials are missing';
      throw error;
    }

    const { currentPassword, newPassword } = req.body;
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get the user's email from the session
    const email = req.user.email;
    
    if (!email) {
      return res.status(400).json({ error: 'User email not found in session' });
    }
    
    // First verify the current password by attempting to sign in
    const { error: signInError } = await adminClient.auth.signInWithPassword({
      email,
      password: currentPassword
    });
    
    if (signInError) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update the password in Supabase
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      req.user.auth_user_id,
      { password: newPassword }
    );
    
    if (updateError) {
      throw updateError;
    }
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    
    if (!res.headersSent) {
      return res.status(error.status || 500).json({ 
        error: 'Failed to change password',
        message: error.message
      });
    }
    
    next(error);
  }
});

module.exports = router;
