const express = require('express');
const router = express.Router();
const { authenticate } = require('../modules/auth/middleware/auth.middleware');
const { prisma } = require('../config');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Validation middleware for booking dates and guests
const validateBooking = async (req, res, next) => {
  try {
    const { start_date, end_date, number_of_guests, camping_spot_id } = req.body;

    // Basic validation
    if (!start_date || !end_date || !number_of_guests || !camping_spot_id) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'All fields (start_date, end_date, number_of_guests, camping_spot_id) are required'
      });
    }

    // Convert dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const today = new Date();

    // Date validation
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        details: 'Dates must be in ISO format (YYYY-MM-DD)'
      });
    }

    if (startDate < today) {
      return res.status(400).json({
        error: 'Invalid start date',
        details: 'Start date cannot be in the past'
      });
    }

    if (endDate <= startDate) {
      return res.status(400).json({
        error: 'Invalid date range',
        details: 'End date must be after start date'
      });
    }

    if ((endDate - startDate) / (1000 * 60 * 60 * 24) > 30) {
      return res.status(400).json({
        error: 'Invalid booking duration',
        details: 'Maximum booking duration is 30 days'
      });
    }

    // Guest validation
    const numGuests = parseInt(number_of_guests);
    if (isNaN(numGuests) || numGuests < 1) {
      return res.status(400).json({
        error: 'Invalid number of guests',
        details: 'Number of guests must be at least 1'
      });
    }

    // Check camping spot capacity
    const campingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(camping_spot_id) },
      select: { max_guests: true }
    });

    if (!campingSpot) {
      return res.status(404).json({
        error: 'Camping spot not found',
        details: 'The requested camping spot does not exist'
      });
    }

    if (numGuests > campingSpot.max_guests) {
      return res.status(400).json({
        error: 'Too many guests',
        details: `This camping spot can only accommodate ${campingSpot.max_guests} guests`
      });
    }

    // Check for overlapping bookings
    const overlappingBooking = await prisma.booking.findFirst({
      where: {
        campingSpotId: parseInt(camping_spot_id),
        OR: [
          {
            AND: [
              { startDate: { lte: startDate } },
              { endDate: { gte: startDate } }
            ]
          },
          {
            AND: [
              { startDate: { lte: endDate } },
              { endDate: { gte: endDate } }
            ]
          }
        ]
      }
    });

    if (overlappingBooking) {
      return res.status(409).json({
        error: 'Booking conflict',
        details: 'The selected dates overlap with an existing booking'
      });
    }

    // If all validations pass, attach validated data to request
    req.validatedBooking = {
      startDate,
      endDate,
      numGuests,
      campingSpotId: parseInt(camping_spot_id)
    };

    next();
  } catch (error) {
    next(error);
  }
};

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
router.post('/', authenticate, validateBooking, async (req, res) => {
  try {
    const { startDate, endDate, numGuests, campingSpotId } = req.validatedBooking;
    const userId = req.user.id;

    // Get the camping spot to calculate cost
    const campingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: campingSpotId }
    });

    // Calculate booking duration in days
    const durationMs = endDate - startDate;
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

    // Calculate costs
    const baseCost = campingSpot.price_per_night * durationDays;
    const serviceFee = baseCost * 0.1; // 10% service fee
    const totalCost = baseCost + serviceFee;

    // Create booking with transaction
    const booking = await prisma.$transaction(async (tx) => {
      // Create the booking
      const newBooking = await tx.booking.create({
        data: {
          startDate,
          endDate,
          numberOfGuests: numGuests,
          baseCost,
          serviceFee,
          totalCost,
          status: 1, // Pending payment
          userId,
          campingSpotId
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

      // Create a payment record
      await tx.payment.create({
        data: {
          amount: totalCost,
          status: 'pending',
          bookingId: newBooking.id
        }
      });

      return newBooking;
    });

    res.status(201).json({ 
      message: 'Booking created successfully',
      booking 
    });
  } catch (error) {
    console.error('Error creating booking:', error);

    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Booking conflict',
        message: 'A booking for these dates already exists'
      });
    }

    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Invalid reference',
        message: 'The camping spot or user reference is invalid'
      });
    }

    res.status(500).json({ 
      error: 'Booking creation failed',
      message: 'An unexpected error occurred while creating your booking'
    });
  }
});

// Update a booking
router.put('/:id', validateBooking, async (req, res) => {
  try {
    const { startDate, endDate, numGuests } = req.validatedBooking;

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

    const updatedBooking = await prisma.booking.update({
      where: { id: parseInt(req.params.id) },
      data: {
        startDate,
        endDate,
        numberOfGuests: numGuests
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