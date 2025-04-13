const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');
const { authenticate } = require('../middlewares/auth');
// Import the webhook middleware
const { stripeWebhookMiddleware } = require('../middlewares/webhooks');

// At the top of the file, add a simple memory cache
const processedSessions = new Map(); // Store processed sessions to prevent duplicate processing

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Log for debugging
    console.log(`Creating payment intent for amount: ${amount} EUR`);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(amount) * 100), // Convert to cents
      currency: 'eur',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('Payment intent created:', paymentIntent.id);
    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id 
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      details: error.message 
    });
  }
});

// Create Stripe Checkout session
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { booking } = req.body;

    if (!booking) {
      return res.status(400).json({ error: 'Booking details are required' });
    }

    // Calculate amount in cents
    const amountInCents = Math.round(parseFloat(booking.total) * 100);

    // Create metadata for the booking details
    const metadata = {
      camping_spot_id: booking.camping_spot_id.toString(),
      user_id: booking.user_id.toString(),
      start_date: booking.start_date,
      end_date: booking.end_date,
      number_of_guests: booking.number_of_guests.toString(),
      base_price: booking.base_price.toString()
    };

    // Create a Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Camping Reservation (${booking.nights || 1} nights)`,
              description: `From ${booking.start_date} to ${booking.end_date}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: metadata,
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/campers`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
});

// Handle successful checkout and create booking
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Simple session check
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // For simplicity, assume all sessions with payment_status are valid
    // This simplifies the logic - we just trust Stripe's response
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Extract booking details from session metadata
    const { camping_spot_id, user_id, start_date, end_date, number_of_guests, base_price } = session.metadata;

    // Check if this session has already been processed (to avoid duplicates)
    const existingBooking = await prisma.bookings.findFirst({
      where: {
        user_id: parseInt(user_id),
        camper_id: parseInt(camping_spot_id),
        start_date: new Date(start_date),
        end_date: new Date(end_date)
      }
    });

    // If booking already exists, return it
    if (existingBooking) {
      console.log(`Found existing booking ${existingBooking.booking_id} for session ${sessionId}`);
      return res.json({
        success: true,
        bookingId: existingBooking.booking_id
      });
    }

    console.log(`Creating new booking for session ${sessionId}`);
    
    // Create booking record
    const booking = await prisma.bookings.create({
      data: {
        camper_id: parseInt(camping_spot_id),
        user_id: parseInt(user_id),
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        number_of_guests: parseInt(number_of_guests),
        cost: parseFloat(base_price),
        created_at: new Date(),
        status_id: 2 // CONFIRMED
      }
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        amount: parseFloat(session.amount_total) / 100, // Convert from cents to euros
        status_id: 2, // CONFIRMED
        booking_id: booking.booking_id
      }
    });

    console.log(`Successfully created booking ${booking.booking_id} for session ${sessionId}`);
    return res.json({
      success: true,
      bookingId: booking.booking_id
    });
  } catch (error) {
    console.error('Session processing error:', error);
    res.status(500).json({ error: 'Failed to process payment session', details: error.message });
  }
});

// Create booking after successful payment
router.post('/confirm', async (req, res) => {
  try {
    const { 
      camping_spot_id,
      user_id,
      start_date,
      end_date,
      number_of_guests,
      total,
      base_price
    } = req.body;

    // Validate required fields
    if (!camping_spot_id || !user_id || !start_date || !end_date || !number_of_guests || !total) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const booking = await prisma.bookings.create({
      data: {
        camper_id: parseInt(camping_spot_id),
        user_id: parseInt(user_id),
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        number_of_guests: parseInt(number_of_guests),
        cost: parseFloat(base_price),
        created_at: new Date(),
        status_id: 2 // CONFIRMED
      }
    });

    await prisma.transaction.create({
      data: {
        amount: parseFloat(total),
        status_id: 2, // CONFIRMED
        booking_id: booking.booking_id
      }
    });

    res.status(201).json({ success: true, bookingId: booking.booking_id });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ error: 'Failed to create booking', details: error.message });
  }
});

// Create booking
router.post('/create', async (req, res) => {
  try {
    const { 
      camping_spot_id,
      user_id, 
      start_date, 
      end_date, 
      number_of_guests,
      total,          // Total with service fee
      base_price      // Base price (price_per_night * nights)
    } = req.body;

    // Validate required fields
    if (!camping_spot_id || !user_id || !start_date || !end_date || !total || !base_price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const booking = await prisma.bookings.create({
      data: {
        camper_id: parseInt(camping_spot_id),
        user_id: parseInt(user_id),
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        number_of_guests: parseInt(number_of_guests),
        cost: parseFloat(base_price),  // Save base price without service fee
        created_at: new Date(),
        status_id: 2 // CONFIRMED
      }
    });

    // Create transaction with total amount (including service fee)
    await prisma.transaction.create({
      data: {
        amount: parseFloat(total),  // Save total with service fee
        status_id: 2, // CONFIRMED
        booking_id: booking.booking_id
      }
    });

    res.status(201).json({ 
      success: true,
      bookingId: booking.booking_id 
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get booking details
router.get('/:id', async (req, res) => {
  try {
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: parseInt(req.params.id) },
      include: {
        camping_spot: {
          include: {
            images: true,
            location: {
              include: {
                country: true
              }
            }
          }
        },
        status_booking_transaction: true, // Include status info
        transaction: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ error: 'Failed to get booking details' });
  }
});

// Cancel booking
router.post('/:id/cancel', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Update booking status to cancelled
      const booking = await tx.bookings.update({
        where: { booking_id: parseInt(req.params.id) },
        data: { status_id: 3 }, // CANCELLED
        include: {
          transaction: true,
          status_booking_transaction: true
        }
      });

      // Create cancellation transaction record
      await tx.transaction.create({
        data: {
          amount: 0,
          status_id: 3, // CANCELLED
          booking_id: booking.booking_id
        }
      });

      return booking;
    });

    res.json(result);
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// Add auto-completion of bookings
router.post('/complete-past-stays', async (req, res) => {
  try {
    const today = new Date();

    // Find all CONFIRMED bookings that have ended
    const pastBookings = await prisma.bookings.findMany({
      where: {
        status_id: 2, // CONFIRMED
        end_date: {
          lt: today
        }
      }
    });

    // Update their status to COMPLETED
    const updates = await Promise.all(
      pastBookings.map(booking =>
        prisma.bookings.update({
          where: { booking_id: booking.booking_id },
          data: { status_id: 4 } // COMPLETED
        })
      )
    );

    res.json({ completed: updates.length });
  } catch (error) {
    console.error('Complete stays error:', error);
    res.status(500).json({ error: 'Failed to complete past stays' });
  }
});

// Create a checkout session for direct payment
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    const { camping_spot_id, user_id, start_date, end_date, number_of_guests, base_price, service_fee } = req.body;
    
    console.log('Checkout session request:', req.body);
    
    // Data validation
    if (!camping_spot_id || !user_id || !start_date || !end_date || !number_of_guests) {
      console.error('Missing required fields:', { 
        camping_spot_id, 
        user_id, 
        start_date, 
        end_date, 
        number_of_guests 
      });
      
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Please provide all required booking details'
      });
    }
    
    // Convert dates to Date objects for validation
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    
    // Calculate number of nights
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Get camping spot info for price and availability check
    const campingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(camping_spot_id) },
      include: {
        location: {
          include: { country: true }
        }
      }
    });
    
    if (!campingSpot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }
    
    // Check if the spot is available for these dates
    const overlappingBookings = await prisma.bookings.findMany({
      where: {
        camper_id: parseInt(camping_spot_id),
        status_id: { in: [2, 4, 5] }, // Confirmed, Completed, Unavailable
        OR: [
          { AND: [
            { start_date: { lte: endDate } },
            { end_date: { gte: startDate } }
          ]}
        ]
      }
    });
    
    if (overlappingBookings.length > 0) {
      return res.status(400).json({ 
        error: 'Camping spot is not available for the selected dates' 
      });
    }
    
    // Calculate price
    const baseTotal = campingSpot.price_per_night * days;
    
    // Use provided service fee or calculate if not provided (10%)
    const serviceFeeAmount = service_fee ? parseFloat(service_fee) : (baseTotal * 0.1);
    
    // Calculate total amount with service fee
    const totalAmount = baseTotal + serviceFeeAmount;
    
    // Create line items for Stripe checkout
    const lineItems = [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Booking: ${campingSpot.title}`,
            description: `${days} nights from ${start_date} to ${end_date}`,
            images: campingSpot.images?.length > 0 ? [campingSpot.images[0].image_url] : [],
          },
          unit_amount: Math.round(baseTotal * 100), // Convert to cents
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Service Fee (10%)',
            description: 'Booking service fee',
          },
          unit_amount: Math.round(serviceFeeAmount * 100), // Convert to cents
        },
        quantity: 1,
      }
    ];
    
    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/camper/${camping_spot_id}`,
      metadata: {
        camping_spot_id,
        user_id,
        start_date,
        end_date,
        number_of_guests,
        base_price: baseTotal.toString(),
        service_fee: serviceFeeAmount.toString()
      }
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout Session Error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Payment webhook for stripe events
router.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
      // Construct the event from the raw body and signature
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle specific events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Extract booking details from metadata
        const { camping_spot_id, user_id, start_date, end_date, number_of_guests, base_price, service_fee } = session.metadata;
        
        // Create booking record with service fee included
        await prisma.bookings.create({
          data: {
            camper_id: parseInt(camping_spot_id),
            user_id: parseInt(user_id),
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            number_of_guests: parseInt(number_of_guests),
            cost: parseFloat(session.amount_total / 100), // Convert from cents
            base_price: parseFloat(base_price),
            service_fee: parseFloat(service_fee),
            created_at: new Date(),
            status_id: 2, // Confirmed
            payment_intent_id: session.payment_intent
          }
        });
        
        break;
      }
      
      // ...existing code...
    }
    
    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Get all bookings for a user
router.get('/user/:userId', authenticate, async (req, res) => {
  try {    
    const { userId } = req.params;
    
    // Ensure the authenticated user is accessing their own bookings
    const authUserId = req.supabaseUser?.id;
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await prisma.public_users.findFirst({
      where: { 
        auth_user_id: authUserId
      }
    });
    
    if (!user || user.user_id !== parseInt(userId)) {
      return res.status(403).json({ error: 'You can only access your own bookings' });
    }
    
    const bookings = await prisma.bookings.findMany({
      where: { 
        user_id: parseInt(userId),
        status_id: { not: 5 } // Exclude UNAVAILABLE status
      },
      include: {
        camping_spot: {
          include: {
            images: true,
            location: {
              include: {
                country: true
              }
            }
          }
        },
        status_booking_transaction: true,
        transaction: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    res.json(bookings);
  } catch (error) {
    console.error('Get User Bookings Error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

module.exports = router;