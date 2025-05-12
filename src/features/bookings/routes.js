const express = require('express');
const router = express.Router();
const { authenticate } = require('../modules/auth/middleware/auth.middleware');
const { prisma } = require('../config');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Public success route
router.get('/success', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get the booking details from the session metadata
    const {
      camper_id,
      user_id,
      start_date,
      end_date,
      number_of_guests,
      cost,
      service_fee,
      total
    } = session.metadata;

    // Validate required fields
    if (!camper_id || !user_id || !start_date || !end_date || !number_of_guests || !cost || !total) {
      console.error('Missing required fields in session metadata:', session.metadata);
      return res.status(400).json({ error: 'Invalid session data' });
    }

    // Create the booking in the database
    const booking = await prisma.bookings.create({
      data: {
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        number_of_guests: parseInt(number_of_guests),
        cost: parseFloat(cost),
        created_at: new Date(),
        camping_spot: { connect: { camping_spot_id: parseInt(camper_id) } },
        users: { connect: { user_id: parseInt(user_id) } },
        status_booking_transaction: { connect: { status_id: 2 } } // Status 2 = Confirmed
      },
      include: {
        camping_spot: {
          include: {
            images: true,
            location: true
          }
        },
        users: {
          select: {
            full_name: true
          }
        }
      }
    });

    // Create the transaction record
    const transaction = await prisma.transaction.create({
      data: {
        amount: parseFloat(total),
        bookings: { connect: { booking_id: booking.booking_id } },
        status_booking_transaction: { connect: { status_id: 2 } }
      }
    });

    res.json({
      success: true,
      booking: {
        id: booking.booking_id,
        start_date: booking.start_date,
        end_date: booking.end_date,
        number_of_guests: booking.number_of_guests,
        cost: booking.cost,
        total: transaction.amount,
        status: 'Confirmed',
        spot: {
          id: booking.camping_spot.camping_spot_id,
          title: booking.camping_spot.title,
          image: booking.camping_spot.images?.[0]?.image_url,
          location: booking.camping_spot.location
        }
      }
    });
  } catch (error) {
    console.error('Error processing successful payment:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Booking already exists' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Camping spot or user not found' });
    }
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Apply authentication middleware to all routes except success
router.use((req, res, next) => {
  if (req.path === '/success') {
    return next();
  }
  authenticate(req, res, next);
});

// Get all bookings for the current user
router.get('/', async (req, res) => {
  try {
    const bookings = await prisma.bookings.findMany({
      where: { 
        user_id: req.user.user_id,
        status_id: {
          not: 5 // Exclude blocked bookings
        }
      },
      include: {
        camping_spot: {
          include: {
            location: true,
            images: true
          }
        },
        status_booking_transaction: true,
        transaction: true // Include transaction data
      }
    });

    // Map the bookings to include transaction amount and service fee
    const bookingsWithTransaction = bookings.map(booking => {
      // Calculate service fee (10% of the booking cost)
      const serviceFee = booking.cost * 0.1;
      
      return {
        ...booking,
        transactionAmount: booking.transaction?.amount || null,
        serviceFee: parseFloat(serviceFee.toFixed(2)),
        // For clarity, breakdown of costs
        costBreakdown: {
          baseCost: booking.cost,
          serviceFee: parseFloat(serviceFee.toFixed(2)),
          total: booking.transaction?.amount || (booking.cost + serviceFee)
        }
      };
    });

    res.json(bookingsWithTransaction);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a single booking
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { auth_user_id: req.user.id }
    });

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        campingSpot: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only allow access to the booking owner or the camping spot owner
    if (booking.userId !== user.id && booking.campingSpot.ownerId !== user.id) {
      return res.status(403).json({ error: 'Not authorized to view this booking' });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new booking
router.post('/', async (req, res) => {
  try {
    const { campingSpotId, startDate, endDate, numberOfGuests } = req.body;

    // Check if the camping spot exists
    const campingSpot = await prisma.campingSpot.findUnique({
      where: { id: parseInt(campingSpotId) }
    });

    if (!campingSpot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    // Check if the dates are available
    const existingBooking = await prisma.booking.findFirst({
      where: {
        campingSpotId: parseInt(campingSpotId),
        OR: [
          {
            startDate: {
              lte: new Date(endDate)
            },
            endDate: {
              gte: new Date(startDate)
            }
          }
        ]
      }
    });

    if (existingBooking) {
      return res.status(400).json({ error: 'These dates are not available' });
    }

    const user = await prisma.user.findUnique({
      where: { auth_user_id: req.user.id }
    });

    const booking = await prisma.booking.create({
      data: {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        numberOfGuests,
        userId: user.id,
        campingSpotId: parseInt(campingSpotId)
      },
      include: {
        campingSpot: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a booking
router.put('/:id', async (req, res) => {
  try {
    const { startDate, endDate, numberOfGuests } = req.body;

    const user = await prisma.user.findUnique({
      where: { auth_user_id: req.user.id }
    });

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only allow the booking owner to update
    if (booking.userId !== user.id) {
      return res.status(403).json({ error: 'Not authorized to update this booking' });
    }

    // Check if the new dates are available
    const existingBooking = await prisma.booking.findFirst({
      where: {
        campingSpotId: booking.campingSpotId,
        id: { not: booking.id },
        OR: [
          {
            startDate: {
              lte: new Date(endDate)
            },
            endDate: {
              gte: new Date(startDate)
            }
          }
        ]
      }
    });

    if (existingBooking) {
      return res.status(400).json({ error: 'These dates are not available' });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: parseInt(req.params.id) },
      data: {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        numberOfGuests
      },
      include: {
        campingSpot: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    res.json(updatedBooking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Cancel a booking
router.delete('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { auth_user_id: req.user.id }
    });

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only allow the booking owner to cancel
    if (booking.userId !== user.id) {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }

    await prisma.booking.delete({
      where: { id: parseInt(req.params.id) }
    });

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create Stripe checkout session
router.post('/create-checkout-session', async (req, res) => {
  try {
    console.log('Creating checkout session with data:', req.body);
    
    const {
      camper_id,
      user_id,
      start_date,
      end_date,
      number_of_guests,
      cost,
      service_fee,
      total,
      spot_name
    } = req.body;

    // Validate required fields
    if (!camper_id || !user_id || !start_date || !end_date || !number_of_guests || !cost || !total) {
      console.error('Missing required fields:', { camper_id, user_id, start_date, end_date, number_of_guests, cost, total });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the auth token from the request
    const authToken = req.headers.authorization?.replace('Bearer ', '');
    if (!authToken) {
      console.error('No auth token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Create Stripe checkout session with minimal metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: spot_name || 'Camping Spot Booking',
            },
            unit_amount: Math.round(total * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/campers/${camper_id}`,
      metadata: {
        camper_id,
        user_id,
        start_date,
        end_date,
        number_of_guests,
        cost,
        service_fee,
        total
      }
    });

    console.log('Created Stripe session:', session.id);
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Invalid payment request' });
    }
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Update booking status
router.put('/:id/status', async (req, res) => {
  try {
    const { status_id } = req.body;
    const bookingId = parseInt(req.params.id);

    if (isNaN(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID' });
    }

    // Get the booking
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: bookingId },
      include: {
        users: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if the user is authorized to update the booking
    if (booking.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Not authorized to update this booking' });
    }

    // Update only the booking status
    const updatedBooking = await prisma.bookings.update({
      where: { booking_id: bookingId },
      data: {
        status_booking_transaction: {
          connect: { status_id: status_id }
        }
      },
      include: {
        status_booking_transaction: true
      }
    });

    res.json(updatedBooking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

module.exports = router;