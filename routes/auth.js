const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../src/middleware/validation');
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
    
    // Verify Supabase session and get user data
    const { data: userData, error: userError } = await adminClient.auth.getUser(data.session.access_token);

    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Invalid Supabase session' });
    }

    // Find or create user in our database
    let user;
    try {
      user = await prisma.users.findFirst({
        where: { email: userData.user.email }
      });
      
      if (!user) {
        // Create user if not found - this fixes the case where a user exists in Supabase Auth
        // but not in our public users table
        console.log(`User ${userData.user.email} exists in Supabase Auth but not in public users table. Creating now...`);
        user = await prisma.users.create({
          data: {
            email: userData.user.email,
            full_name: userData.user.user_metadata?.full_name || userData.user.email.split('@')[0],
            isowner: userData.user.user_metadata?.isowner || "0",
            verified: 'yes',
            created_at: new Date(),
            updated_at: new Date(),
            password_hash: 'supabase_managed' // Add password_hash field with default value
          }
        });
        console.log(`Auto-created missing user record with ID: ${user.user_id}`);
      }
    } catch (dbError) {
      console.warn('Failed to create/find user in database:', dbError.message);
      console.error('Error details:', dbError.code, dbError.meta);
      
      // Check if this is a schema issue
      if (dbError.message && dbError.message.includes('does not exist')) {
        return res.status(500).json({ 
          error: 'Database configuration error', 
          message: 'The users table is not properly configured' 
        });
      }
      
      throw dbError;
    }
    
    // Create session
    req.session.userId = user.user_id;
    req.session.email = user.email;
    req.session.isowner = Number(user.isowner);

    // Use generateToken helper for consistent token structure
    const token = generateToken(user);

    // Send cookie with JWT token
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
        isowner: Number(user.isowner),
        verified: user.verified
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
 * @desc    Register a new user (redirects to /register for unified registration)
 * @access  Public
 */
router.post('/signup', validate(registerUserSchema), async (req, res, next) => {
  console.log('Signup endpoint called - redirecting to consolidated register endpoint');
  // Simply forward the request to the /register endpoint
  return req.app._router.handle(req, res, next);
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
    
    console.log(`Processing password reset request for email: ${email}`);
    
    // Check if user exists in our database
    const user = await prisma.users.findUnique({
      where: { email }
    });
    
    if (!user) {
      // Still return success for security (don't reveal if email exists)
      return res.json({ message: 'If an account exists with this email, a password reset link will be sent.' });
    }
    
    // Use Supabase to send password reset email
    const { error } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
    });
    
    if (error) {
      console.error('Supabase password reset error:', error);
      // Don't expose error details to client
      return res.json({ message: 'If an account exists with this email, a password reset link will be sent.' });
    }
    
    res.json({ message: 'Password reset email has been sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
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
    await prisma.users.update({
      where: { user_id: userId },
      data: {
        full_name: fullName,
        isowner: isOwner,
        updated_at: new Date()
      }
    });
    
    // Get updated user
    const updatedUser = await prisma.users.findUnique({
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
    
    // Verify Supabase session and get user data
    const { data: userData, error: userError } = await adminClient.auth.getUser(data.session.access_token);

    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Invalid Supabase session' });
    }

    // Find or create user in our database
    let user;
    try {
      user = await prisma.users.findFirst({
        where: { email: userData.user.email }
      });
      
      if (!user) {
        // Create user if not found - this fixes the case where a user exists in Supabase Auth
        // but not in our public users table
        console.log(`User ${userData.user.email} exists in Supabase Auth but not in public users table. Creating now...`);
        user = await prisma.users.create({
          data: {
            email: userData.user.email,
            full_name: userData.user.user_metadata?.full_name || userData.user.email.split('@')[0],
            isowner: userData.user.user_metadata?.isowner || "0",
            verified: 'yes',
            created_at: new Date(),
            updated_at: new Date(),
            password_hash: 'supabase_managed' // Add password_hash field with default value
          }
        });
        console.log(`Auto-created missing user record with ID: ${user.user_id}`);
      }
    } catch (dbError) {
      console.warn('Failed to create/find user in database:', dbError.message);
      console.error('Error details:', dbError.code, dbError.meta);
      
      // Check if this is a schema issue
      if (dbError.message && dbError.message.includes('does not exist')) {
        return res.status(500).json({ 
          error: 'Database configuration error', 
          message: 'The users table is not properly configured' 
        });
      }
      
      throw dbError;
    }
    
    // Create session
    req.session.userId = user.user_id;
    req.session.email = user.email;
    req.session.isowner = Number(user.isowner);

    // Use generateToken helper for consistent token structure
    const token = generateToken(user);

    // Send cookie with JWT token
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
        isowner: Number(user.isowner),
        verified: user.verified
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
 * @desc    Register a new user in both Supabase Auth and public users table
 * @access  Public
 */
router.post('/register', validate(registerUserSchema), async (req, res) => {
  console.log('Processing registration request');
  
  try {
    if (!isConfigured) {
      console.error('Supabase not configured');
      return res.status(503).json({
        error: 'Authentication service not configured',
        details: 'Please check server configuration'
      });
    }

    // Log the raw request body for debugging
    console.log('Raw request body:', req.body);

    const { email, password, full_name } = req.body;
    // Don't destructure is_seller with a default value
    const is_seller = req.body.is_seller;
    console.log(`Attempting to register user: ${email}`);
    
    // Step 1: Check if user already exists in the public users table first
    try {
      const existingDbUser = await prisma.users.findFirst({
        where: { email }
      });
      
      if (existingDbUser) {
        console.log('User already exists in public users table:', existingDbUser.user_id);
        return res.status(409).json({
          error: 'User already exists',
          message: 'A user with this email is already registered'
        });
      }
    } catch (dbError) {
      console.error('Error checking if user exists:', dbError);
      // Continue with the registration process even if there's an error here
      // But log the error for troubleshooting
      console.error('Error details:', dbError.code, dbError.meta);
    }
    
    // Step 2: Check if the user exists in Supabase Auth
    let authUser;
    let existingSupabaseUser = false;
    
    const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
      email,
      password
    });
    
    // If sign in succeeds, the user already exists in Supabase
    if (!signInError && signInData) {
      console.log('User exists in Supabase auth but not in our database');
      authUser = signInData;
      existingSupabaseUser = true;
    } else {
      // User doesn't exist in Supabase, create a new one
      console.log('User not found in Supabase auth, creating new user');
      
      // Create user in Supabase
      const { data, error } = await adminClient.auth.signUp({
        email,
        password,
        options: {
          data: { 
            full_name,
            isowner: is_seller ? '1' : '0'
          }
        }
      });
      
      if (error) {
        console.error('Supabase signup error:', error);
        return res.status(400).json({
          error: error.message,
          details: error
        });
      }
      
      authUser = data;
    }
    
    // Step 3: Create user in our database if we have Supabase user data
    if (authUser?.user) {
      try {
        console.log('Raw request body:', req.body);

        // Convert is_seller to a normalized format
        let isOwner = false;
        const is_seller_val = req.body.is_seller;

        // Handle all possible formats that could mean "true"
        if (is_seller_val === true || 
            is_seller_val === 1 ||
            is_seller_val === '1' ||
            is_seller_val === 'true' ||
            is_seller_val === 'yes') {
          isOwner = true;
        }

        console.log('Owner status determination:', {
          raw_is_seller_val: is_seller_val,
          typeof_is_seller: typeof is_seller_val,
          isOwner: isOwner
        });
          // Create user and owner record in a single transaction
        const newUser = await prisma.$transaction(async (prisma) => {
          console.log('Creating user with owner status:', isOwner);
          
          const user = await prisma.users.create({
            data: {
              email,
              full_name,
              isowner: isOwner ? '1' : '0',
              verified: 'yes',
              created_at: new Date(),
              updated_at: new Date()
            }
          });

          console.log('Created user with data:', user);

          if (isOwner) {
            const license = req.body.license || 'none';
            console.log('Creating owner record with:', { userId: user.user_id, license });
            await prisma.owner.create({
              data: {
                owner_id: user.user_id,
                license: license
              }
            });
            console.log(`Created owner record for user: ${user.user_id}`);
          } else {
            console.log('Not creating owner record since isOwner is false');
          }

          return user;
        });
        
        console.log(`User processed successfully with ID: ${newUser.user_id}, owner status: ${newUser.isowner}`);
        
        // Generate JWT token for authentication
        const token = jwt.sign(
          {
            sub: newUser.user_id,
            email: newUser.email,
            isowner: Number(newUser.isowner)
          },
          process.env.JWT_SECRET || 'dev-secret-key',
          { expiresIn: '7d' }
        );
        
        // Log successful user creation
        console.log(`User processed successfully: ${newUser.email}`);
        
        // Return response with user data and token
        return res.status(201).json({
          message: 'User registered successfully',
          user: {
            id: newUser.user_id,
            email: newUser.email,
            fullName: newUser.full_name,
            isowner: Number(newUser.isowner)
          },
          token
        });
      } catch (dbError) {
        console.error('Database error during user processing:', dbError);
        console.error('Error details:', {
          code: dbError.code,
          meta: dbError.meta,
          message: dbError.message
        });
        
        // Only delete the Supabase user if we just created it (not if it already existed)
        if (!existingSupabaseUser && authUser?.user?.id) {
          try {
            await adminClient.auth.admin.deleteUser(authUser.user.id);
            console.log(`Rolled back Supabase user creation for ${email}`);
          } catch (deleteError) {
            console.error('Failed to rollback Supabase user:', deleteError);
          }
        }
        
        // Check if this is a unique constraint violation
        if (dbError.code === 'P2002') {
          return res.status(409).json({
            error: 'User already exists',
            details: 'A user with this email already exists in our database',
            suggestion: 'Try logging in instead of registering'
          });
        }
        
        return res.status(500).json({
          error: 'Failed to create user record',
          details: dbError.message
        });
      }
    } else {
      return res.status(500).json({
        error: 'Failed to create user',
        details: 'No user data received from authentication service'
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
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
    
    console.log(`Processing password reset request for email: ${email}`);
    
    // Check if user exists in our database
    const user = await prisma.users.findUnique({
      where: { email }
    });
    
    if (!user) {
      // Still return success for security (don't reveal if email exists)
      return res.json({ message: 'If an account exists with this email, a password reset link will be sent.' });
    }
    
    // Use Supabase to send password reset email
    const { error } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
    });
    
    if (error) {
      console.error('Supabase password reset error:', error);
      // Don't expose error details to client
      return res.json({ message: 'If an account exists with this email, a password reset link will be sent.' });
    }
    
    res.json({ message: 'Password reset email has been sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
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
    await prisma.users.update({
      where: { user_id: userId },
      data: {
        full_name: fullName,
        isowner: isOwner,
        updated_at: new Date()
      }
    });
    
    // Get updated user
    const updatedUser = await prisma.users.findUnique({
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
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get user's email from the session
    const email = req.user.email;
    
    if (!email) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // First verify the current password using Supabase
    const { error: signInError } = await adminClient.auth.signInWithPassword({
      email,
      password: currentPassword
    });
    
    if (signInError) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        message: 'The current password you entered is incorrect'
      });
    }
    
    // Get the Supabase user
    const { data: { user: supabaseUser } } = await adminClient.auth.getUser();
    
    if (!supabaseUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update password in Supabase
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      supabaseUser.id,
      { password: newPassword }
    );
    
    if (updateError) {
      throw updateError;
    }
    
    res.json({ 
      success: true,
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('Password change error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Failed to change password',
        message: error.message
      });
    }
  }
});

/**
 * Handle user sync between Supabase and local database
 */
router.post('/sync-session', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                 req.cookies?.token || 
                 req.body?.token;

    if (!token) {
      console.log('No token provided in sync-session');
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.sub) {
        console.log('Invalid token decoded in sync-session');
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get user from database using user_id (sub) or email
      const user = await prisma.users.findFirst({
        where: {
          OR: [
            { user_id: parseInt(decoded.sub) },
            { email: decoded.email }
          ]
        },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          verified: true
        }
      });

      if (!user) {
        console.log('User not found in database during sync-session');
        return res.status(401).json({ error: 'User not found' });
      }

      // Update session if it exists
      if (req.session) {
        req.session.userId = user.user_id;
        req.session.email = user.email;
        req.session.isowner = user.isowner;
      }

      // Generate new token if needed
      const tokenExp = decoded.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const refreshThreshold = 24 * 60 * 60 * 1000; // 24 hours
      
      let newToken = null;
      if (tokenExp - now < refreshThreshold) {
        newToken = jwt.sign(
          { 
            sub: user.user_id.toString(),
            email: user.email,
            name: user.full_name 
          },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
      }

      console.log('Session sync successful for user:', user.email);
      
      // Return user data with optional new token
      res.json({
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          isowner: Number(user.isowner) || 0,
          verified: user.verified
        },
        ...(newToken && { token: newToken })
      });

    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError.message);
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Session sync error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle preflight requests for all auth routes
router.options('*', (req, res) => {
    // Send response headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(200).send();
});

// Helper function for registration error handling
async function handleRegistrationError(error, userId = null) {
  console.error('Registration error:', error);

  // If we have a userId, attempt to clean up the Supabase user
  if (userId) {
    try {
      await adminClient.auth.admin.deleteUser(userId);
      console.log(`Cleaned up Supabase user ${userId} after error`);
    } catch (cleanupError) {
      console.error('Failed to clean up Supabase user:', cleanupError);
    }
  }

  // Return appropriate error response
  if (error.code === 'P2002') {
    return {
      status: 409,
      body: {
        error: 'User already exists',
        details: 'An account with this email already exists'
      }
    };
  }

  if (error.message?.includes('duplicate key')) {
    return {
      status: 409,
      body: {
        error: 'Registration conflict',
        details: 'This user account already exists'
      }
    };
  }

  return {
    status: 500,
    body: {
      error: 'Registration failed',
      message: error.message || 'An unexpected error occurred during registration'
    }
  };
}

module.exports = router;