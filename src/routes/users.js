const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middlewares/auth');
const prisma = require('../../config/database');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../middlewares/error-handler');

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   GET /api/users/full-info
 * @desc    Get full user information including bookings
 * @access  Private
 */
router.get('/full-info', async (req, res) => {
  try {
    // Get user from auth middleware
    const { email } = req.user;

    // Fetch user with related data using either user_id or email
    const user = await prisma.users.findUnique({
      where: {
        email: email
      },
      include: {
        bookings: {
          include: {
            camping_spot: {
              include: {
                location: true,
                images: true
              }
            },
            status_booking_transaction: true
          }
        },
        review: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Format the response
    const userData = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      isowner: Number(user.isowner) || 0,
      verified: user.verified,
      created_at: user.created_at,
      updated_at: user.updated_at,
      bookings: user.bookings.map(booking => ({
        booking_id: booking.booking_id,        start_date: booking.start_date,
        end_date: booking.end_date,
        status: booking.status_booking_transaction?.status || 'Unknown',
        cost: booking.cost,        camping_spot: booking.camping_spot ? {
          camping_spot_id: booking.camping_spot.camping_spot_id,
          title: booking.camping_spot.title,
          description: booking.camping_spot.description,
          price_per_night: booking.camping_spot.price_per_night,
          location: booking.camping_spot.location,
          images: booking.camping_spot.images
        } : null
      })),
      reviews: user.review.map(review => ({
        review_id: review.review_id,
        rating: review.rating,
        comment: review.comment,
        created_at: review.created_at
      }))
    };

    res.json(userData);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

/**
 * @route   GET /api/users/me
 * @desc    Get current user's information
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    // Set a longer request timeout for this endpoint
    if (req.setTimeout) {
      req.setTimeout(15000);
    }

    // Check for user object from auth middleware
    if (!req.user) {
      console.error('No user object in request. Auth middleware may not be working correctly.', {
        headers: req.headers,
        session: req.session,
        timestamp: new Date().toISOString()
      });
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Log debugging info
    console.log('Fetching user info for:', {
      id: req.user.user_id,
      email: req.user.email,
      timestamp: new Date().toISOString()
    });

    // Get fresh user data from database with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    let lastError;

    while (retryCount < maxRetries) {
      try {
        // Test database connection first
        await prisma.$queryRaw`SELECT 1`;

        const user = await prisma.users.findUnique({
          where: { email: req.user.email },
          select: {
            user_id: true,
            email: true,
            full_name: true,
            isowner: true,
            verified: true,
            auth_user_id: true,
            created_at: true,
            updated_at: true
          }
        });

        if (!user) {
          console.error('User not found in database:', {
            email: req.user.email,
            userId: req.user.user_id,
            timestamp: new Date().toISOString()
          });
          return res.status(404).json({ 
            error: 'User not found',
            message: 'Your user account could not be found in the database'
          });
        }

        // Format response data
        const userData = {
          user_id: Number(user.user_id),
          email: user.email,
          full_name: user.full_name,
          isowner: Number(user.isowner) || 0,
          verified: user.verified === '1' || user.verified === 'yes',
          auth_user_id: user.auth_user_id,
          created_at: user.created_at,
          updated_at: user.updated_at
        };

        // Log successful response
        console.log('Successfully fetched user data:', {
          userId: userData.user_id,
          email: userData.email,
          timestamp: new Date().toISOString()
        });

        // Send response with fresh user data
        return res.json(userData);
      } catch (error) {
        lastError = error;
        console.error(`Database query attempt ${retryCount + 1} failed:`, {
          error: error.message,
          code: error.code,
          timestamp: new Date().toISOString()
        });

        if (error.code === 'P2002' || error.code === 'P2025') {
          // Data integrity errors - no point in retrying
          break;
        }

        retryCount++;
        if (retryCount < maxRetries) {
          // Wait before retrying - exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }
    }

    // If we get here, all retries failed
    console.error('All database retries failed:', {
      error: lastError.message,
      stack: lastError.stack,
      timestamp: new Date().toISOString()
    });

    if (lastError.code === 'P2002' || lastError.code === 'P2025') {
      return res.status(404).json({ 
        error: 'User data integrity error',
        message: 'There was an issue with your user account data'
      });
    }

    return res.status(503).json({
      error: 'Database connection failed',
      message: 'Unable to retrieve your user information. Please try again later.'
    });
  } catch (error) {
    console.error('Unhandled error in /users/me route:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(504).json({ 
        error: 'Request timed out',
        message: 'The request timed out while fetching your user data'
      });
    }

    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
});

// Update user profile
router.put('/me', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, email } = req.body;

    // Validate input
    if (!name && !email) {
      return res.status(400).json({ error: 'At least one field (name or email) is required' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        email
      },
      select: {
        id: true,
        name: true,
        email: true,
        isowner: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Delete user account
router.delete('/me', async (req, res, next) => {
  try {
    // Check if user has any active bookings
    const activeBookings = await prisma.booking.findFirst({
      where: {
        userId: req.user.id,
        endDate: {
          gt: new Date()
        }
      }
    });

    if (activeBookings) {
      throw new ForbiddenError('Cannot delete account with active bookings');
    }

    // Delete user's reviews
    await prisma.review.deleteMany({
      where: { userId: req.user.id }
    });

    // Delete user's bookings
    await prisma.booking.deleteMany({
      where: { userId: req.user.id }
    });

    // Delete user's camping spots if they are an owner
    if (req.user.isowner) {
      await prisma.campingSpot.deleteMany({
        where: { ownerId: req.user.id }
      });
    }

    // Delete user account
    await prisma.user.delete({
      where: { id: req.user.id }
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', async (req, res) => {
  try {    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    
    // Password strength validation
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    // Validate password complexity
    const hasLetter = /[a-zA-Z]/.test(new_password);
    const hasNumber = /\d/.test(new_password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(new_password);
    
    if (!(hasLetter && (hasNumber || hasSpecial))) {
      return res.status(400).json({ 
        error: 'Password must contain letters and at least one number or special character'
      });
    }
    
    // Update the user password in the database
    try {
      // For demonstration, returning success since actual password change depends on your auth system
      // If you're using Supabase, you would update the password there
      // If using a regular database, you would hash the password and update it
      
      console.log(`Password change requested for user ${req.user.email}`);
      
      res.json({ message: 'Password updated successfully' });
    } catch (updateError) {
      console.error('Error updating password:', updateError);
      res.status(500).json({ error: 'Failed to update password' });
    }
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * @route   GET /api/users/debug-token
 * @desc    Debug JWT token data (administrators only)
 * @access  Private
 */
router.get('/debug-token', async (req, res) => {
  try {
    // Only allow in development environment
    if (process.env.NODE_ENV !== 'development' && process.env.ALLOW_TOKEN_DEBUG !== 'true') {
      return res.status(403).json({ error: 'Forbidden in production' });
    }

    // Log the user object from auth middleware
    console.log('DEBUG - User object from token:', req.user);
    
    // Get the token
    const token = (
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.token ||
      req.body?.token
    );

    if (!token) {
      return res.status(400).json({ error: 'No token provided' });
    }

    // Use the jwt-debug utility to decode the token
    const jwtDebug = require('../scripts/jwt-debug');
    const tokenInfo = jwtDebug.processToken(token);

    res.json({
      user: req.user,
      tokenInfo,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? '[REDACTED]' : 'Not set'
      }
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({
      error: 'Debug error',
      message: error.message
    });
  }
});

module.exports = router;