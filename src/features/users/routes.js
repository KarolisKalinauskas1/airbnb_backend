const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../middlewares/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const changePasswordRouter = require('./routes/change-password');
const meRouter = require('./routes/me');

// Apply authentication middleware to all routes
router.use(authenticate);

// Mount sub-routes
router.use('/me', meRouter);
router.use('/change-password', changePasswordRouter);

/**
 * Helper function to find user by email
 */
async function findUserByEmail(email) {
  try {
    console.log('Looking up user with email:', email);
    return await prisma.users.findUnique({
      where: { email },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        auth_user_id: true,
        isowner: true,
        verified: true,
        created_at: true,
        updated_at: true,
        bookings: true,
        review: true
      }
    });
  } catch (error) {
    console.error('Error finding user by email:', error);
    throw error;
  }
}

/**
 * @route   GET /api/users/full-info
 * @desc    Get full user information including bookings
 * @access  Private
 */
router.get('/full-info', async (req, res) => {
  try {
    // Get user from auth middleware
    const { email } = req.user;    // Fetch user with related data using email
    const user = await prisma.users.findUnique({
      where: { email },
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
      verified: user.verified || 'no',
      created_at: user.created_at,
      updated_at: user.updated_at,
      bookings: user.bookings.map(booking => ({
        booking_id: booking.booking_id,
        start_date: booking.start_date,
        end_date: booking.end_date,
        status: booking.status_booking_transaction?.status || 'Unknown',
        cost: booking.cost,
        camping_spot: booking.camping_spot ? {
          camping_spot_id: booking.camping_spot.camping_spot_id,
          title: booking.camping_spot.title,
          description: booking.camping_spot.description,
          price_per_night: booking.camping_spot.price_per_night,
          location: booking.camping_spot.location,
          images: booking.camping_spot.images
        } : null
      }))
    };

    res.json(userData);
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
    const { email } = req.user;

    // Check for active bookings
    const user = await prisma.public_users.findUnique({
      where: { email },
      include: {
        bookings: {
          where: {
            end_date: {
              gt: new Date()
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.bookings.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete account',
        details: 'You have active bookings'
      });
    }

    // Delete user from database and Supabase
    const { data: { user: supabaseUser } } = await adminClient.auth.getUser(token);
    
    if (supabaseUser) {
      try {
        await adminClient.auth.admin.deleteUser(supabaseUser.id);
        console.log('Deleted user from Supabase');
      } catch (supabaseError) {
        console.error('Failed to delete user from Supabase:', supabaseError);
      }
    }

    await prisma.user.delete({
      where: { user_id: user.user_id }
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.params.id;
    console.log('Looking up user with ID:', userId);

    let user;
    // First try to find by email since that's what Supabase might send
    try {
      user = await prisma.users.findUnique({
        where: { email: userId },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          verified: true,
          created_at: true,
          updated_at: true,
          bookings: true,
          review: true
        }
      });
    } catch (err) {
      // If not found by email, try by user_id
      user = await prisma.users.findUnique({
        where: { user_id: parseInt(userId) },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          verified: true,
          created_at: true,
          updated_at: true,
          bookings: true,
          review: true
        }
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Format the response to match expected schema
    const userData = {
      ...user,
      isowner: Number(user.isowner) || 0 // Convert string '1'/'0' to number
    };

    res.json(userData);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

module.exports = router;