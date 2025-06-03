// Consolidated booking routes
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../middlewares/auth');
const prisma = require('../../../config/database').prisma;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const EmailService = require('../../shared/services/email.service');

// Define success route first to bypass authentication
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
        camping_spot: true,
        users: true
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

    try {
      // Get the full user record for sending email
      const user = await prisma.users.findUnique({
        where: { user_id: parseInt(user_id) }
      });
      
      if (user) {
        await EmailService.sendBookingConfirmation(booking, user);
        console.log(`Sent confirmation email for booking ${booking.booking_id} to ${user.email}`);
      } else {
        console.warn(`User not found for booking confirmation email: ${user_id}`);
      }
    } catch (emailError) {
      console.error('Failed to send booking confirmation email:', emailError);
      // Don't fail the booking if email fails
    }

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
          location: booking.camping_spot?.location
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

// Apply authentication middleware to all other routes
router.use(authenticate);

// Get bookings for the currently logged in user
router.get('/user', async (req, res) => {
  const requestId = Date.now().toString();
  console.log(`[${requestId}] Starting /bookings/user request`);

  try {
    if (!req.user?.email) {
      console.warn(`[${requestId}] Missing authentication`);
      return res.status(401).json({ error: 'Authentication required' });
    }

    const normalizedEmail = req.user.email.toLowerCase().trim();
    console.log(`[${requestId}] Looking up bookings for email: ${normalizedEmail}`);

    // Find user directly with email first
    let user;
    try {
      user = await prisma.users.findUnique({
        where: { email: normalizedEmail },
        select: {
          user_id: true,
          email: true,
          verified: true
        }
      });

      console.log(`[${requestId}] User lookup result:`, {
        found: !!user,
        userId: user?.user_id,
        email: user?.email
      });
    } catch (userError) {
      console.error(`[${requestId}] Error finding user:`, {
        error: userError.message,
        code: userError.code,
        meta: userError.meta
      });
      if (userError.code === 'P2024' || userError.code?.startsWith('P1')) {
        return res.status(503).json({ 
          error: 'Database connection error',
          message: 'Unable to connect to database. Please try again.',
          requestId
        });
      }
      return res.status(500).json({ 
        error: 'Database error while finding user',
        requestId 
      });
    }

    if (!user) {
      console.warn(`[${requestId}] No user found for email: ${normalizedEmail}`);
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Unable to find your user account'
      });
    }

    // Fetch bookings with retries
    try {
      console.log(`[${requestId}] Fetching bookings for user_id: ${user.user_id}`);
      const bookings = await prisma.bookings.findMany({
        where: { 
          user_id: user.user_id,
          status_id: {
            not: 5 // Exclude blocked bookings
          }
        },
        include: {
          camping_spot: {
            include: {
              images: {
                take: 1,
                orderBy: { created_at: 'desc' }
              },
              location: {
                include: { country: true }
              }
            }
          },
          status_booking_transaction: true,
          transaction: true,
          review: true
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      // Format bookings for response with careful error handling
      const formattedBookings = bookings.map(booking => {
        try {
          // Calculate service fee (10% of base cost)
          const baseCost = parseFloat(booking.cost) || 0;
          const serviceFee = baseCost * 0.1;
          const totalCost = baseCost + serviceFee;
          
          // Get camping spot title with fallback
          const campingSpot = booking.camping_spot;
          const spotTitle = campingSpot?.title || 'Unnamed Spot';
          
          if (process.env.NODE_ENV === 'development') {
            console.log('Processing booking:', booking.booking_id);
            console.log('  title:', spotTitle);
            console.log('  raw camping_spot:', JSON.stringify(campingSpot));
          }

          return {
            id: booking.booking_id,
            start_date: booking.start_date,
            end_date: booking.end_date,
            number_of_guests: booking.number_of_guests,
            status: booking.status_booking_transaction?.status || 'Pending',
            status_id: booking.status_id,
            created_at: booking.created_at,
            baseCost: baseCost,
            serviceFee: serviceFee,
            totalCost: totalCost,
            has_review: !!booking.review,
            spot: {
              id: campingSpot.camping_spot_id,
              name: spotTitle,
              title: spotTitle,
              description: campingSpot.description || '',
              price_per_night: campingSpot.price_per_night || 0,
              location: campingSpot.location || {},
              images: campingSpot.images || []
            }
          };
        } catch (formatError) {
          console.error('Error formatting booking:', {
            error: formatError.message,
            bookingId: booking.booking_id
          });
          // Return a minimally valid booking object if there's an error
          return {
            id: booking.booking_id,
            start_date: booking.start_date,
            end_date: booking.end_date,
            status: 'Error',
            baseCost: 0,
            serviceFee: 0,
            totalCost: 0
          };
        }
      });

      console.log(`[${requestId}] Successfully formatted ${formattedBookings.length} bookings`);
      return res.json(formattedBookings);

    } catch (bookingsError) {
      console.error(`[${requestId}] Error fetching bookings:`, {
        userId: user.user_id,
        error: bookingsError.message,
        code: bookingsError.code,
        meta: bookingsError.meta,
        stack: bookingsError.stack
      });
      
      if (bookingsError.code === 'P2024' || bookingsError.code?.startsWith('P1')) {
        return res.status(503).json({ 
          error: 'Database connection error',
          message: 'Unable to connect to database. Please try again.',
          requestId
        });
      }
      
      return res.status(500).json({ 
        error: 'Error fetching bookings',
        requestId
      });
    }
  } catch (error) {
    console.error(`[${requestId}] Unhandled error in /bookings/user:`, {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
      requestId
    });
  }
});

// Get a single booking
router.get('/:id', async (req, res) => {
  try {    if (!req.user?.email) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await prisma.users.findUnique({
      where: { email: req.user.email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const booking = await prisma.bookings.findUnique({
      where: { booking_id: parseInt(req.params.id) },
      include: {
        camping_spot: {
          include: {
            owner: {
              select: {
                user_id: true,
                full_name: true,
                email: true
              }
            },
            images: true,
            location: true
          }
        },
        users: true,
        status_booking_transaction: true,
        transaction: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Allow access to the booking owner or the camping spot owner
    if (booking.user_id !== user.user_id && booking.camping_spot.owner_id !== user.user_id) {
      return res.status(403).json({ error: 'Not authorized to view this booking' });
    }

    const serviceFee = booking.cost * 0.1;
    const formattedBooking = {
      ...booking,
      serviceFee: parseFloat(serviceFee.toFixed(2)),
      totalCost: booking.cost + serviceFee
    };

    res.json(formattedBooking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking details' });
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

    // Get booking and check permissions
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: bookingId },
      include: {
        users: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check authorization using user_id from our database
    const user = await prisma.users.findUnique({
      where: { email: req.user.email }
    });

    if (!user || booking.user_id !== user.user_id) {
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

// Cancel a booking
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id);

    // Check if booking exists
    const booking = await prisma.bookings.findUnique({
      where: { 
        booking_id: bookingId 
      },
      include: {
        camping_spot: true,
        users: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify the user is the owner of the booking
    if (booking.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }

    // Update the booking status to cancelled
    const updatedBooking = await prisma.bookings.update({
      where: { booking_id: bookingId },
      data: {
        status_booking_transaction: {
          connect: { status_id: 3 } // Assuming 3 is "Cancelled"
        }
      },
      include: {
        camping_spot: true,
        users: true
      }
    });

    // Send cancellation email
    try {
      await EmailService.sendBookingCancellation(booking, booking.users);
      console.log(`Sent cancellation email for booking ${bookingId} to ${booking.users.email}`);
    } catch (emailError) {
      console.error('Failed to send cancellation email:', emailError);
      // Don't fail the cancellation if email fails
    }

    return res.json({
      message: 'Booking cancelled successfully',
      booking: {
        id: updatedBooking.booking_id,
        status: 'Cancelled'
      }
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/booking-failed`,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Booking for ${spot_name}`,
              description: `${start_date} to ${end_date}`
            },
            unit_amount: Math.round(total * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
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

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Invalid payment request' });
    }
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook for successful payments
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const booking = await prisma.bookings.create({
        data: {
          start_date: new Date(session.metadata.start_date),
          end_date: new Date(session.metadata.end_date),
          number_of_guests: parseInt(session.metadata.number_of_guests),
          cost: parseFloat(session.metadata.cost),
          status_booking_transaction: {
            connect: { status_id: 2 } // Status 2 = Confirmed
          },
          camping_spot: {
            connect: { camping_spot_id: parseInt(session.metadata.camper_id) }
          },
          users: {
            connect: { user_id: parseInt(session.metadata.user_id) }
          }
        },
        include: {
          camping_spot: true,
          users: true
        }
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          amount: parseFloat(session.metadata.total),
          booking_id: booking.booking_id,
          status_id: 2 // Confirmed
        }
      });

      // Send confirmation email
      try {
        await EmailService.sendBookingConfirmation(booking, booking.users);
        console.log(`Sent confirmation email for booking ${booking.booking_id}`);
      } catch (emailError) {
        console.error('Failed to send booking confirmation email:', emailError);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error processing payment completion:', error);
      res.status(500).json({ error: 'Failed to process payment completion' });
    }
  }
});

module.exports = router;
