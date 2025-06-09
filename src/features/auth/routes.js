const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { adminClient } = require('../../../config/supabase');
const { ValidationError } = require('../../../middlewares/error-handler');
const { registerUserSchema, loginUserSchema } = require('../../../schemas/user-schemas');

/**
 * Register new user
 */
router.post('/register', async (req, res) => {
  console.log('==== POST /api/auth/register ENDPOINT CALLED ====');
  console.log('Registration endpoint called with data:', req.body);
  
  try {
    const { email, password, full_name, is_seller = false } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Email, password, and full name are required'
      });
    }

    // Check if user already exists in our database
    console.log('Checking if user exists in users table...');
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'User already exists',
        details: 'A user with this email is already registered'
      });
    }

    // Create user in Supabase first
    const { data: signUpData, error: signUpError } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          isowner: is_seller
        }
      }
    });

    if (signUpError) {
      console.error('Supabase signup error:', signUpError);
      return res.status(500).json({
        error: 'Authentication error',
        details: signUpError.message
      });
    }

    // If Supabase signup successful, create user in our database
    const user = await prisma.users.create({
      data: {
        email,
        full_name,
        isowner: is_seller ? '1' : '0',
        verified: 'no', // Default to not verified
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    // Generate JWT with consistent fields
    const token = jwt.sign(
      {
        sub: user.user_id.toString(), // sub must be string
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner),
        verified: user.verified
      },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: '7d' }
    );

    // Return success with user data and token
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: user.isowner
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Login user
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // First authenticate with Supabase
    const { data: supabaseData, error: supabaseError } = await adminClient.auth.signInWithPassword({
      email,
      password
    });

    if (supabaseError) {
      throw new ValidationError('Invalid credentials');
    }
    
    // If Supabase auth succeeds, get user from our database using email
    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      throw new ValidationError('User not found');
    }

    // Generate JWT token with user info
    const token = jwt.sign(
      {
        sub: user.user_id,
        email: user.email,
        name: user.full_name,
        isowner: user.isowner
      },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: '7d' }
    );

    // Return user data and token
    res.json({
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: user.isowner,
        verified: user.verified
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

    // Verify and decode the JWT token
    try {
      console.log('Verifying token in sync-session');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
      
      if (!decoded || !decoded.sub) {
        console.log('Invalid token decoded in sync-session');
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get user from database using auth_user_id first, then fall back to email
      console.log('Looking up user...');
      const user = await prisma.users.findFirst({
        where: {
          OR: [
            { auth_user_id: decoded.sub },
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
router.post('/refresh-token', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: { error: 'Too many token refresh attempts, please try again later' },
  headers: true,
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || req.ip;
  }
}), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify the token (ignore expiration)
    const decoded = jwt.verify(token, jwtConfig.secret, { ignoreExpiration: true });

    // Get user from database by email
    const user = await prisma.users.findFirst({
      where: {
        email: decoded.email.toLowerCase()
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new token with consistent fields
    const newToken = jwt.sign(
      {
        sub: user.user_id.toString(),
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner),
        verified: user.verified
      },
      jwtConfig.secret,
      { expiresIn: '7d' }
    );

    res.json({
      token: newToken,
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: user.isowner === '1' ? '1' : '0',
        verified: user.verified === '1' ? '1' : '0'
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * Request password reset
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // First check if user exists in our database
    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      // Don't reveal that the user doesn't exist
      return res.json({ 
        message: 'If an account exists with this email, a password reset link will be sent.' 
      });
    }

    // Send reset email via Supabase
    const { error } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
    });

    if (error) {
      console.error('Failed to send reset password email:', error);
      // Don't reveal error details to client
      return res.json({ 
        message: 'If an account exists with this email, a password reset link will be sent.' 
      });
    }

    res.json({ message: 'Password reset email has been sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * Change password
 */
router.post('/change-password', async (req, res) => {
  try {
    console.log('Debug - Change Password Request:', {
      hasToken: !!req.headers.authorization,
      token: req.headers.authorization ? 'Bearer ...[truncated]' : 'missing',
      hasCurrentPassword: !!req.body.currentPassword,
      hasNewPassword: !!req.body.newPassword,
      newPasswordLength: req.body.newPassword ? req.body.newPassword.length : 0
    })

    const { currentPassword, newPassword } = req.body
    
    // Get authorization token
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      console.log('Debug - No token provided')
      return res.status(401).json({ error: 'Authentication required' })
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key')
    console.log('Debug - Token verified:', { sub: decoded.sub, email: decoded.email })

    if (!decoded || !decoded.email) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const email = decoded.email;

    // Get user from our database
    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // First verify current password with Supabase
    const { error: signInError } = await adminClient.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (signInError) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // If current password is correct, update password in Supabase
    const { data: userData } = await adminClient.auth.updateUser({
      password: newPassword
    });

    if (!userData?.user) {
      throw new Error('Failed to update password');
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user from both Supabase and local session
 * @access  Public
 */
router.post('/logout', async (req, res) => {
  console.log('Processing logout request...');
  try {
    // Try to get the refresh token from the request if available
    const refreshToken = req.body.refresh_token || req.cookies['sb-refresh-token'];

    // Sign out from Supabase with the specific session if we have a refresh token
    if (refreshToken) {
      const { error } = await adminClient.auth.signOut({
        refresh_token: refreshToken,
        scope: 'global'
      });
      if (error) {
        console.warn('Supabase signout error:', error);
      }
    } else {
      // Global signout if no specific session
      const { error } = await adminClient.auth.signOut({ scope: 'global' });
      if (error) {
        console.warn('Supabase global signout error:', error);
      }
    }

    // Clear all authentication-related cookies
    const cookiesToClear = [
      'token',
      'session',
      'sb-refresh-token',
      'sb-access-token',
      'camping.sid',
      'auth_token'
    ];

    cookiesToClear.forEach(cookie => {
      res.clearCookie(cookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
    });

    // Destroy Express session if it exists
    if (req.session) {
      req.session.destroy(err => {
        if (err) {
          console.warn('Session destruction error:', err);
        }
      });
    }

    console.log('Logout successful');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    // Even if there's an error, we want to clear cookies and return success
    // This ensures the client can still "log out" even if server-side cleanup fails
    const cookiesToClear = [
      'token',
      'session',
      'sb-refresh-token',
      'sb-access-token',
      'camping.sid',
      'auth_token'
    ];

    cookiesToClear.forEach(cookie => {
      res.clearCookie(cookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
    });

    res.status(200).json({ 
      message: 'Logged out successfully',
      warning: 'Some cleanup operations may have failed'
    });
  }
});

/**
 * Sync user from Supabase to database
 */
router.post('/sync-user', async (req, res) => {
  try {
    console.log('User sync request received');
    
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization token provided' });
    }
    
    const token = authHeader.substring(7);
    
    // Verify token with Supabase
    const { data: userData, error: verifyError } = await adminClient.auth.getUser(token);
    
    if (verifyError || !userData.user) {
      console.error('Token verification failed:', verifyError);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const supabaseUser = userData.user;
    
    // Check if user already exists in database
    const existingUser = await prisma.users.findUnique({
      where: { email: supabaseUser.email }
    });
    
    if (existingUser) {
      console.log('User already exists in database:', existingUser.user_id);
      return res.json({
        success: true,
        message: 'User already synchronized',
        user: existingUser
      });
    }
    
    // Create user in database
    const newUser = await prisma.users.create({
      data: {
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name || 
                  supabaseUser.raw_user_meta_data?.full_name || 
                  supabaseUser.email.split('@')[0],
        isowner: Number(supabaseUser.user_metadata?.isowner || 
                       supabaseUser.raw_user_meta_data?.isowner || 0),
        verified: 'yes',
        created_at: new Date(),
        updated_at: new Date()
      }
    });
    
    console.log('Successfully created user in database:', newUser.user_id);
    
    res.json({
      success: true,
      message: 'User synchronized successfully',
      user: newUser
    });
    
  } catch (error) {
    console.error('User sync error:', error);
    
    if (error.code === 'P2002') {
      // Unique constraint violation - user was created by another request
      return res.json({
        success: true,
        message: 'User was synchronized by another process'
      });
    }
    
    res.status(500).json({
      error: 'Failed to sync user',
      message: error.message
    });
  }
});

module.exports = router;