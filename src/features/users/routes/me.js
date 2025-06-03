const express = require('express');
const router = express.Router();
const { prisma, ensureConnection } = require('../../../../config/prisma');

/**
 * @route   GET /api/users/me
 * @desc    Get current user's information
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    // Ensure database connection is established
    await ensureConnection();
    
    // Log request details
    console.log('GET /me request:', {
      headers: {
        authorization: req.headers.authorization ? 'present' : 'missing',
        cookie: req.headers.cookie ? 'present' : 'missing'
      },
      session: req.session ? 'present' : 'missing',
      user: req.user ? 'present' : 'missing'
    });

    if (!req.user) {
      console.error('No user object in request. Auth middleware state:', {
        headers: req.headers,
        session: req.session
      });
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'No user found in request. Please ensure you are logged in.'
      });
    }

    // Log user info from token for debugging
    const tokenInfo = {
      userId: req.user.user_id,
      email: req.user.email
    };
    console.log('User from token:', tokenInfo);

    // Search for user by email
    if (!req.user.email) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Email is required to identify user.'
      });
    }

    const user = await prisma.users.findUnique({
      where: { email: req.user.email }
    });

    if (!user) {
      console.error('User not found in database:', tokenInfo);
      return res.status(404).json({
        error: 'User not found',
        message: 'Could not find a matching user record in the database.'
      });
    }

    // Return user data with consistent format
    res.json({
      user_id: user.user_id,
      auth_user_id: user.auth_user_id,
      email: user.email,
      full_name: user.full_name,
      isowner: Number(user.isowner) || 0,
      verified: user.verified || 'no',
      created_at: user.created_at,
      updated_at: user.updated_at
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    
    // Add database connection check
    if (!prisma) {
      return res.status(500).json({
        error: 'Database configuration error',
        message: 'Database client is not properly initialized'
      });
    }

    // Add more specific error handling
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A database constraint was violated'
      });
    }

    if (error.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
        message: 'The requested record does not exist'
      });
    }

    // Send a detailed error in development
    res.status(500).json({ 
      error: 'Failed to fetch user information',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? {
        error: error.message,
        stack: error.stack,
        code: error.code
      } : undefined
    });
  }
});

module.exports = router;
