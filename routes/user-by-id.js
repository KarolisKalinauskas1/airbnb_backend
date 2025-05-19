/**
 * Special route handler for fetching user data by ID
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import auth middleware with error handling
let authenticate;
try {
  authenticate = require('../middleware/auth').authenticate;
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
 * @route   GET /api/user-by-id/:id
 * @desc    Get user info by user ID
 * @access  Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID', 
        message: 'User ID must be a number' 
      });
    }
    
    console.log(`[user-by-id] Looking up user with ID: ${userId}`);
    
    // Find user by ID
    const user = await prisma.public_users.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        verified: true,
        bio: true,
        profile_image: true,
        created_at: true,
        updated_at: true
      }
    });
    
    if (!user) {
      console.log(`[user-by-id] No user found with ID: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Format response data
    const userData = {
      ...user,
      isowner: Number(user.isowner) || 0
    };
    
    return res.json(userData);
  } catch (error) {
    console.error('[user-by-id] Error:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: 'Failed to retrieve user information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
