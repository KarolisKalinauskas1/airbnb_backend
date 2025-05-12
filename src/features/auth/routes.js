const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// Fix the import to use the correct prisma client
const prisma = require('../config/prisma');
const { ValidationError } = require('../shared/middleware/error.middleware');
const { verifyToken, jwtConfig } = require('../config');
// Fixed import for Supabase - import from correct path with correct exports
const { adminClient: supabaseAdmin } = require('../../config/supabase');
// Import the user schemas
const { registerUserSchema, loginUserSchema } = require('../../schemas/user-schemas');
// Import adminClient from the correct location for user creation
const { adminClient } = require('../../config/supabase');

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
 * Check if Supabase is configured
 */
const isConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

/**
 * @route   POST /api/auth/register
 * @desc    Register user and create session (unified registration endpoint)
 * @access  Public
 */
router.post('/register', async (req, res, next) => {
  try {
    console.log('\n\n==== POST /api/auth/register ENDPOINT CALLED ====');
    
    // Map the frontend fields to backend expected fields
    // Check if fullName was sent as name (frontend) instead of full_name (backend expected)
    if (req.body.name && !req.body.full_name) {
      req.body.full_name = req.body.name;
    }
    
    // Handle is_seller/isowner field mapping - normalize to is_seller
    if (req.body.isowner !== undefined && req.body.is_seller === undefined) {
      req.body.is_seller = req.body.isowner;
    }
    
    // Log the received data after field mapping
    console.log('Registration endpoint called with data:', { 
      email: req.body.email,
      has_password: !!req.body.password,
      full_name: req.body.full_name,
      is_seller: req.body.is_seller
    });
    
    // Apply schema validation after field mapping
    try {
      registerUserSchema.parse(req.body);
    } catch (validationError) {
      console.error('Validation error:', validationError.errors);
      return res.status(400).json({ 
        error: 'Invalid registration data', 
        details: validationError.errors.map(e => e.message) 
      });
    }
    
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
      
      // Check if session exists before attempting to use it
      if (req.session) {
        // Create session
        console.log('Setting up user session...');
        req.session.userId = user.user_id;
        req.session.email = user.email;
        req.session.isowner = user.isowner;
        req.session.auth_user_id = user.auth_user_id;
        console.log('Session created successfully');
      } else {
        console.log('Warning: Session object is not available. Session data not stored.');
        // Continue without creating a session - the user will still be registered
      }
      
      console.log('Registration successful, user ID:', user.user_id);
      console.log('Registration successful, returning response');
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          isowner: Number(user.isowner) || 0
        },
        session: req.session ? {
          userId: user.user_id,
          email: user.email,
          authenticated: true
        } : undefined
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

// Login user
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);

    // Validate input
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Step 1: First check if user exists in public_users
    const publicUser = await prisma.public_users.findUnique({
      where: { email }
    });

    if (!publicUser) {
      console.log('User not found in public_users database');
      throw new ValidationError('Invalid credentials');
    }

    // Step 2: Authenticate via Supabase (which has the password)
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Supabase authentication failed:', error.message);
      throw new ValidationError('Invalid credentials');
    }

    console.log('Supabase authentication successful');

    // Step 3: Generate JWT token
    const token = jwt.sign(
      { 
        id: publicUser.user_id,
        email: publicUser.email,
        isowner: publicUser.isowner 
      },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', email);

    res.json({
      user: {
        user_id: publicUser.user_id,
        full_name: publicUser.full_name,
        email: publicUser.email,
        isowner: Number(publicUser.isowner) || 0,
        verified: publicUser.verified
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
});

/**
 * @route   POST /api/auth/sync-session
 * @desc    Sync session with backend and return user data
 * @access  Public
 */
router.post('/sync-session', async (req, res) => {
  try {
    console.log('Sync session request received');
    // Check for token in headers, cookies, or request body
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                 req.cookies?.token || 
                 req.body?.token;

    if (!token) {
      console.log('No token provided in sync-session');
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify and decode the JWT token directly
    try {
      console.log('Verifying token in sync-session');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.email) {
        console.log('Invalid token decoded in sync-session');
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get user from database using email
      console.log(`Looking up user with email: ${decoded.email}`);
      const user = await prisma.public_users.findUnique({
        where: {
          email: decoded.email
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

      console.log('Session sync successful for user:', user.email);
      
      // Return user data
      res.json({
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          isowner: Number(user.isowner) || 0,
          verified: user.verified
        }
      });
    } catch (jwtError) {
      console.error('JWT verification failed in sync-session:', jwtError.message);
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Authentication failed' });
    }
  } catch (error) {
    console.error('Session sync error:', error);
    return res.status(500).json({ error: 'Internal server error during session sync' });
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh an expired JWT token
 * @access  Public
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify the token (but ignore expiration)
    const decoded = jwt.verify(token, jwtConfig.secret, { ignoreExpiration: true });

    // Get user from database - fixed to use public_users model for consistency
    const user = await prisma.public_users.findUnique({
      where: {
        email: decoded.email
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new token
    const newToken = jwt.sign(
      { 
        id: user.user_id,
        email: user.email,
        isowner: user.isowner 
      },
      jwtConfig.secret,
      { expiresIn: '24h' }
    );

    res.json({
      token: newToken,
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner) || 0,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password (requires current password)
 * @access  Private
 */
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Extract token from Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify token to get user data
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
      
      if (!decoded || !decoded.email) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      const email = decoded.email;
      
      // Get user from database to ensure they exist
      const user = await prisma.public_users.findUnique({
        where: { email }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // First verify the current password by attempting to sign in with Supabase
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
      
      // Update the password in Supabase
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        user.auth_user_id,
        { password: newPassword }
      );
      
      if (updateError) {
        throw updateError;
      }
      
      // Password changed successfully
      res.json({ 
        success: true,
        message: 'Password changed successfully' 
      });
      
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError.message);
      return res.status(401).json({ error: 'Authentication failed' });
    }
    
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

module.exports = router;