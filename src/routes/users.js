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
    const userId = req.user.user_id;

    const user = await prisma.public_users.findUnique({
      where: { user_id: parseInt(userId) },
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
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      ...user,
      isowner: Number(user.isowner) || 0
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user information' });
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

module.exports = router; 