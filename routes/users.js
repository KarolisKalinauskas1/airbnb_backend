const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Fix the POST route
router.post('/', async (req, res) => {
  const { email, full_name, is_seller, license, auth_user_id } = req.body
  try {
    const existing = await prisma.public_users.findUnique({ where: { email } })
    if (existing) return res.status(200).json({ message: 'User already exists' })

    const newUser = await prisma.public_users.create({
      data: {
        email,
        full_name,
        date_of_birth: 'unknown',
        verified: 'no',
        isowner: is_seller === true ? '1' : '0', // Fix: Ensure boolean comparison
        created_at: new Date(),
        auth_user_id // Add this field
      }
    })

    if (is_seller) {
      await prisma.owner.create({
        data: {
          owner_id: newUser.user_id,
          license: license || 'none'
        }
      })
    }

    res.status(201).json({ message: 'User created' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Fix the sync route
router.post('/sync', async (req, res) => {
  const { email, full_name, is_seller, license, auth_user_id } = req.body

  try {
    const existing = await prisma.public_users.findUnique({ where: { email } })

    if (!existing) {
      const newUser = await prisma.public_users.create({
        data: {
          email,
          full_name,
          date_of_birth: 'unknown',
          verified: 'no',
          isowner: is_seller === true ? '1' : '0', // Fix: Ensure boolean comparison
          created_at: new Date(),
          auth_user_id
        }
      })

      if (is_seller) {
        await prisma.owner.create({
          data: {
            owner_id: newUser.user_id,
            license: license || 'none'
          }
        })
      }

      return res.status(201).json({ message: 'User synced and added' })
    }

    res.status(200).json({ message: 'User already exists' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to sync user' })
  }
})

// Import the consolidated middleware
const { authenticate } = require('../middlewares/auth');

// GET full user info by Supabase email
router.get('/full-info', authenticate, async (req, res) => {
  try {
    const email = req.supabaseUser.email;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Add error handling and logging
    console.log(`Fetching user info for email: ${email}`);

    const results = await prisma.$queryRawUnsafe(`
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.isowner,
        COALESCE(
          json_agg(
            CASE WHEN b.booking_id IS NOT NULL THEN
              json_build_object(
                'booking_id', b.booking_id,
                'start_date', b.start_date,
                'end_date', b.end_date,
                'cost', b.cost,
                'number_of_guests', b.number_of_guests,
                'created_at', b.created_at,
                'status_id', b.status_id,  /* Add this line to include status_id */
                'review', CASE
                  WHEN r.review_id IS NOT NULL THEN json_build_object(
                    'review_id', r.review_id,
                    'rating', r.rating,
                    'comment', r.comment
                  )
                  ELSE NULL
                END,
                'transaction', (
                  SELECT json_agg(
                    json_build_object(
                      'transaction_id', tr.transaction_id,
                      'amount', tr.amount,
                      'status_id', tr.status_id
                    )
                  ) 
                  FROM transaction tr
                  WHERE tr.booking_id = b.booking_id
                ),
                'camping_spot', CASE
                  WHEN cs.camping_spot_id IS NOT NULL THEN json_build_object(
                    'camping_spot_id', cs.camping_spot_id,
                    'title', cs.title,
                    'description', cs.description,
                    'max_guests', cs.max_guests,
                    'price_per_night', cs.price_per_night,
                    'images', (
                      SELECT json_agg(
                        json_build_object(
                          'image_id', i.image_id,
                          'image_url', i.image_url
                        )
                      )
                      FROM images i
                      WHERE i.camping_id = cs.camping_spot_id
                    )
                  )
                  ELSE NULL
                END
              )
            ELSE NULL
            END
          ) FILTER (WHERE b.booking_id IS NOT NULL), 
          '[]'::json
        ) AS bookings
      FROM public.users u
      LEFT JOIN bookings b ON u.user_id = b.user_id
      LEFT JOIN review r ON b.booking_id = r.booking_id
      LEFT JOIN camping_spot cs ON b.camper_id = cs.camping_spot_id
      LEFT JOIN transaction t ON b.booking_id = t.booking_id
      WHERE u.email = $1
      GROUP BY u.user_id, u.full_name, u.email, u.isowner
    `, email);

    if (!results || results.length === 0) {
      console.log(`No user found for email: ${email}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`User found: ${results[0].user_id}`);
    res.json(results[0]);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update user phone number
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { phone_number } = req.body;

  try {
    const updatedUser = await prisma.public_users.update({
      where: { user_id: parseInt(id) },
      data: { phone_number }
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

module.exports = router
