/**
 * Authentication Routes
 * 
 * Provides endpoints for user authentication operations:
 * - Sign up
 * - Sign in
 * - Password reset
 * - Token validation
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { adminClient, isConfigured } = require('../config/supabase');

// Import the authentication middleware
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/auth/test
 * @desc    Test endpoint to verify authentication
 * @access  Private
 */
router.get('/test', authenticate, (req, res) => {
  res.json({ 
    message: 'Auth is working correctly',
    user: {
      id: req.supabaseUser.id,
      email: req.supabaseUser.email
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   POST /api/auth/signin
 * @desc    Sign in with email/password
 * @access  Public
 */
router.post('/signin', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }

    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const { data, error } = await adminClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * @route   POST /api/auth/signup
 * @desc    Sign up with email/password
 * @access  Public
 */
router.post('/signup', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }

    const { email, password, full_name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const { data, error } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name }
      }
    });
    
    if (error) throw error;
    
    if (data?.user) {
      // Create user in our database as well
      await prisma.public_users.create({
        data: {
          full_name: full_name || email.split('@')[0],
          email: email,
          auth_user_id: data.user.id,
          isowner: 0
        }
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(400).json({ error: error.message });
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
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`
    });
    
    if (error) throw error;
    
    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @route   GET /api/auth/validate
 * @desc    Validate JWT token
 * @access  Public (requires token)
 */
router.get('/validate', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }

    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }
    
    const { data, error } = await adminClient.auth.getUser(token);
    
    if (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    res.json({ valid: true, user: data.user });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Sign in with email/password
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Use Supabase to sign in
    const { data, error } = await adminClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    // Return the session data
    res.json(data);
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(401).json({ error: error.message });
  }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }
    
    const { email, password, full_name, is_seller, license } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Create user in Supabase
    const { data: authData, error: authError } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          isowner: is_seller ? 1 : 0
        }
      }
    });
    
    if (authError) throw authError;
    
    // Create user in our database
    try {
      const newUser = await prisma.public_users.create({
        data: {
          email,
          full_name,
          isowner: is_seller ? 1 : 0,
          auth_user_id: authData.user.id
        }
      });
      
      // If user is a seller, create owner record
      if (is_seller) {
        await prisma.owner.create({
          data: {
            owner_id: newUser.user_id,
            license: license || 'none'
          }
        });
      }
      
      // Return the auth data including session
      res.status(201).json(authData);
    } catch (dbError) {
      console.error('Database error during registration:', dbError);
      
      // Clean up Supabase user if database insert fails
      if (adminClient.auth.admin && typeof adminClient.auth.admin.deleteUser === 'function') {
        await adminClient.auth.admin.deleteUser(authData.user.id);
      }
      
      throw new Error('Failed to create user in database');
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Add a health check endpoint for testing
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    configured: isConfigured,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
