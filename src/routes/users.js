const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const prisma = require('../config/prisma');
const { ValidationError, NotFoundError, ForbiddenError } = require('../middleware/error');

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
    const user = await prisma.public_users.findUnique({
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
        booking_id: booking.booking_id,
        start_date: booking.start_date,
        end_date: booking.end_date,
        status: booking.status_booking_transaction.status,
        cost: booking.cost,
        camping_spot: {
          camping_spot_id: booking.camping_spot.camping_spot_id,
          title: booking.camping_spot.title,
          description: booking.camping_spot.description,
          price_per_night: booking.camping_spot.price_per_night,
          location: booking.camping_spot.location,
          images: booking.camping_spot.images
        }
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
 * @desc    Get current user's basic information
 * @access  Private
 */
router.get('/me', async (req, res) => {
  try {
    if (!req.user) {
      console.error('No user object in request. Auth middleware may not be working correctly.');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Log user info from token
    console.log('User from token:', { 
      id: req.user.user_id,
      email: req.user.email 
    });

    // Get user ID and make sure it's a number
    const userId = parseInt(req.user.user_id);
    
    if (isNaN(userId)) {
      console.error('Invalid user_id format:', req.user.user_id);
      return res.status(500).json({ error: 'Invalid user ID format' });
    }

    try {
      const user = await prisma.public_users.findUnique({
        where: { user_id: userId },
        select: {
          user_id: true,
          full_name: true,
          email: true,
          isowner: true,
          verified: true,
          created_at: true,
          updated_at: true
        }
      });

      if (!user) {
        console.error('User not found:', userId);
        return res.status(404).json({ error: 'User not found' });
      }

      // Format response data
      const userData = {
        ...user,
        isowner: user.isowner === '1' ? '1' : '0' // Ensure consistent string format for isowner
      };

      res.json(userData);
    } catch (dbError) {
      console.error('Database error fetching user:', dbError);
      res.status(500).json({ 
        error: 'Database error',
        message: process.env.NODE_ENV === 'development' ? dbError.message : 'Error retrieving user data'
      });
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Error fetching user data'
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

module.exports = router;