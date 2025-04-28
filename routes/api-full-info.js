/**
 * Special route handler for /users/full-info endpoint
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import auth middleware with error handling
let authenticate;
try {
  authenticate = require('../middlewares/auth').authenticate;
  if (typeof authenticate !== 'function') {
    throw new Error('authenticate is not a function');
  }
} catch (error) {
  console.error('Error importing authenticate middleware:', error);
  // Fallback middleware
  authenticate = (req, res, next) => {
    console.warn('Using fallback authentication middleware');
    return res.status(500).json({ 
      error: 'Server configuration error', 
      message: 'Authentication middleware not available'
    });
  };
}

/**
 * @route   GET /users/full-info
 * @desc    Get full user info from auth token
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('[api-full-info] Returning user data:', {
      id: req.user?.user_id,
      email: req.user?.email,
      isowner: req.user?.isowner
    });
    
    // Return full user object (attached from auth middleware)
    res.json(req.user || { error: 'No user data available' });
  } catch (error) {
    console.error('[api-full-info] Error:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: 'Failed to retrieve user information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
