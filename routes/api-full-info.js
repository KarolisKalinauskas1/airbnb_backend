/*
  File: routes/usersFullInfo.js
  Description: Express route handling GET /users/full-info to return full user details based on the authentication token.
  Author: Your Name or Team
  Created: 2025-05-21
  Last Modified: 2025-05-21 by Your Name
*/

// ==================== IMPORTS ====================
const express = require('express');                // Express framework for routing
const router = express.Router();                   // Creates a new router instance
const { PrismaClient } = require('@prisma/client'); // Prisma ORM client for database access
const prisma = new PrismaClient();                  // Instantiate Prisma client

// ==================== AUTH MIDDLEWARE SETUP ====================
let authenticate;
try {
  // Attempt to import the authentication middleware
  authenticate = require('../middlewares/auth').authenticate;
  if (typeof authenticate !== 'function') {
    // If the imported value isn't a function, throw an error to trigger fallback
    throw new Error('authenticate is not a function');
  }
} catch (error) {
  // Log import/setup errors
  console.error('Error importing authenticate middleware:', error);
  // Fallback authentication middleware to return a server configuration error
  authenticate = (req, res, next) => {
    console.warn('Using fallback authentication middleware');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Authentication middleware not available'
    });
  };
}

// ==================== ROUTES ====================
/**
 * @route   GET /users/full-info
 * @desc    Retrieve full user information extracted from auth token
 * @access  Private (requires valid authentication)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    // Log the user info being returned for debugging/auditing
    console.log('[api-full-info] Returning user data:', {
      id: req.user?.user_id,
      email: req.user?.email,
      isowner: req.user?.isowner
    });

    // Respond with the user object attached by the auth middleware
    // Fallback to an error object if req.user is undefined
    res.json(req.user || { error: 'No user data available' });
  } catch (error) {
    // Catch any unexpected errors during processing
    console.error('[api-full-info] Error:', error);
    // Send standardized error response
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to retrieve user information',
      // Include detailed error in development mode only
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== EXPORT ====================
module.exports = router; // Export the configured router for use in the main app
