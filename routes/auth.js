const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware to protect route with Supabase JWT
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'Missing token' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.log('Token validation error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (!user) {
      console.log('No user found for token');
      return res.status(401).json({ error: 'User not found' });
    }

    req.supabaseUser = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Test endpoint
router.get('/test', authenticate, (req, res) => {
  res.json({ 
    message: 'Auth is working correctly',
    user: req.supabaseUser 
  });
});

// Sign in with email/password
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
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

// Sign up with email/password
router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const { data, error } = await supabase.auth.signUp({
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

// Password reset
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`
    });
    
    if (error) throw error;
    
    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Validate JWT token
router.get('/validate', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }
    
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    res.json({ valid: true, user: data.user });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: error.message });
  }
});

// Expose the router, authenticate middleware, and the prisma instance
module.exports = router;
