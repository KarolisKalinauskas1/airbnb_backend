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

// Import Supabase clients from the consolidated config
const { adminClient } = require('../config/supabase');

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

module.exports = router;
