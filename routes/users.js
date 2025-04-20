const express = require('express');
const router = express.Router();
// Import our database connection manager
const db = require('../config/database');
const { authenticate } = require('../middlewares/auth');
const { authClient, isConfigured } = require('../config/supabase');

// Fix the POST route
router.post('/', async (req, res) => {
  const { email, full_name, is_seller, license, auth_user_id } = req.body;
  try {
    // Check if database is connected
    const isConnected = await db.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        message: 'Database connection failed. Please try again later.'
      });
    }

    const existing = await db.execute(async () => {
      return await db.client.public_users.findUnique({ where: { email } });
    });
    
    if (existing) return res.status(200).json({ message: 'User already exists' });

    const newUser = await db.execute(async () => {
      return await db.client.public_users.create({
        data: {
          email,
          full_name,
          date_of_birth: 'unknown',
          verified: 'no',
          isowner: is_seller === true ? '1' : '0',
          created_at: new Date(),
          auth_user_id
        }
      });
    });

    if (!newUser) {
      return res.status(500).json({ error: 'Failed to create user in the database' });
    }

    if (is_seller) {
      await db.execute(async () => {
        return await db.client.owner.create({
          data: {
            owner_id: newUser.user_id,
            license: license || 'none'
          }
        });
      });
    }

    res.status(201).json({ message: 'User created' });
  } catch (err) {
    console.error('Failed to create user:', err);
    res.status(500).json({ error: 'Failed to create user', details: err.message });
  }
});

// Fix the sync route
router.post('/sync', async (req, res) => {
  const { email, full_name, is_seller, license, auth_user_id } = req.body;

  try {
    // Check if database is connected
    const isConnected = await db.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        message: 'Database connection failed. Please try again later.'
      });
    }

    const existing = await db.execute(async () => {
      return await db.client.public_users.findUnique({ where: { email } });
    });

    if (!existing) {
      const newUser = await db.execute(async () => {
        return await db.client.public_users.create({
          data: {
            email,
            full_name,
            date_of_birth: 'unknown',
            verified: 'no',
            isowner: is_seller === true ? '1' : '0',
            created_at: new Date(),
            auth_user_id
          }
        });
      });

      if (!newUser) {
        return res.status(500).json({ error: 'Failed to create user in the database' });
      }

      if (is_seller) {
        await db.execute(async () => {
          return await db.client.owner.create({
            data: {
              owner_id: newUser.user_id,
              license: license || 'none'
            }
          });
        });
      }

      return res.status(201).json({ message: 'User synced and added' });
    }

    res.status(200).json({ message: 'User already exists' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// GET full user info by Supabase email
router.get('/full-info', authenticate, async (req, res) => {
  try {
    const email = req.supabaseUser.email;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if database is connected
    const isConnected = db.isConnected;
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        message: 'Database connection failed. Please try again later.'
      });
    }

    // Find the user
    const user = await db.execute(
      async (prisma) => await prisma.public_users.findFirst({ where: { email } })
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's bookings
    const bookings = await db.execute(
      async (prisma) => await prisma.bookings.findMany({
        where: { user_id: user.user_id },
        include: {
          status_booking_transaction: true,
          camping_spot: {
            include: {
              images: true,
              location: {
                include: { country: true }
              }
            }
          }
        }
      }),
      { defaultReturn: [] }
    );

    // Return user with bookings
    return res.json({
      ...user,
      bookings: Array.isArray(bookings) ? bookings.map(b => ({
        booking_id: b.booking_id,
        start_date: b.start_date,
        end_date: b.end_date,
        number_of_guests: b.number_of_guests,
        cost: b.cost,
        created_at: b.created_at,
        status: b.status_booking_transaction?.name || 'Unknown',
        camping_spot: {
          camping_spot_id: b.camping_spot.camping_spot_id,
          title: b.camping_spot.title,
          price_per_night: b.camping_spot.price_per_night,
          image: b.camping_spot.images?.[0]?.url || null,
          location: b.camping_spot.location ? {
            city: b.camping_spot.location.city,
            country: b.camping_spot.location.country?.name || 'Unknown'
          } : null
        }
      })) : []
    });
  } catch (err) {
    console.error('Error fetching user details:', err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Update user phone number
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { phone_number } = req.body;

  try {
    // Check if database is connected
    const isConnected = await db.isConnected();
    if (!isConnected) {
      return res.status(503).json({ 
        error: 'Database service unavailable',
        message: 'Database connection failed. Please try again later.'
      });
    }

    const updatedUser = await db.execute(async () => {
      return await db.client.public_users.update({
        where: { user_id: parseInt(id) },
        data: { phone_number }
      });
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Auth test endpoint
router.get('/auth-test', authenticate, async (req, res) => {
  try {
    // If we get here, authentication succeeded
    res.json({ 
      status: 'success', 
      message: 'Authentication working correctly',
      user: {
        id: req.supabaseUser.id,
        email: req.supabaseUser.email
      }
    });
  } catch (error) {
    console.error('Auth test error:', error);
    res.status(500).json({ error: 'Internal server error during auth test' });
  }
});

module.exports = router;
