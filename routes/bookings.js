const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticate } = require('../middlewares/auth');
const { logStripeSession } = require('../utils/session-logger');

// Test connection endpoint
router.post('/test-connection', (req, res) => {
  try {
    console.log('Test connection request received:', req.body);
    res.json({ 
      success: true, 
      message: 'Connection successful',
      received: req.body
    });
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({ error: 'Test connection failed', details: error.message });
  }
});

// Create a checkout session for Stripe
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    console.log('Create checkout session request body:', req.body);
    
    // Extract required fields from the request
    const { 
      camper_id, 
      user_id,
      start_date, 
      end_date, 
      number_of_guests, 
      cost,
      service_fee,
      total,
      spot_name,
      spot_image
    } = req.body;
    
    // Basic validation
    if (!camper_id || !user_id || !start_date || !end_date || !number_of_guests || !total) {
      console.error('Missing required fields:', req.body);
      return res.status(400).json({ error: 'Missing required fields for checkout' });
    }

    // Ensure the dates are valid
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid dates' });
    }
    
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    
    // Check that the camping spot exists
    const campingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(camper_id) },
      include: {
        images: true,
        bookings: {
          where: {
            status_id: { in: [1, 2, 5] }, // Pending, Confirmed, or Unavailable
            OR: [
              {
                AND: [
                  { start_date: { lte: endDate } },
                  { end_date: { gte: startDate } }
                ]
              }
            ]
          }
        }
      }
    });
    
    if (!campingSpot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }
    
    // Check for overlapping bookings
    if (campingSpot.bookings && campingSpot.bookings.length > 0) {
      return res.status(400).json({ 
        error: 'Selected dates are not available',
        details: 'These dates have been booked by someone else. Please select different dates.'
      });
    }
    
    // Calculate nights
    const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    // Use the current camping spot price to ensure accuracy
    const basePrice = parseFloat(campingSpot.price_per_night) * nights;
    const serviceFeeAmount = parseFloat(basePrice * 0.1); // 10% service fee
    const totalAmount = basePrice + serviceFeeAmount;
    
    // Create line items for the checkout session
    const lineItems = [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: spot_name ? `${spot_name} (${nights} night${nights > 1 ? 's' : ''})` : `Camping Spot (${nights} night${nights > 1 ? 's' : ''})`,
            description: `Stay from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
            images: spot_image ? [spot_image] : [],
          },
          unit_amount: Math.round(basePrice * 100), // Convert to cents
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Service Fee',
            description: 'Service fee for booking',
          },
          unit_amount: Math.round(serviceFeeAmount * 100), // Convert to cents
        },
        quantity: 1,
      }
    ];
    
    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/camper/${camper_id}`,
      metadata: {
        camper_id: camper_id.toString(),
        user_id: user_id.toString(),
        start_date,
        end_date,
        number_of_guests: number_of_guests.toString(),
        cost: basePrice.toString(),
        service_fee: serviceFeeAmount.toString(),
        total: totalAmount.toString()
      }
    });
    
    console.log('Created checkout session:', session.id);
    
    // Return the checkout URL to redirect the user to Stripe
    res.json({ url: session.url });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
});

// Handle success route with session_id as query param
router.get('/success', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id parameter' });
    }
    
    console.log(`Processing success with session ID: ${session_id}`);
    
    // Add an internal rate limiter to prevent duplicate processing
    const processKey = `processed_${session_id}`;
    if (global[processKey]) {
      console.log(`Session ${session_id} already being processed, preventing duplicate`);
      return res.json({ 
        booking_id: global[processKey],
        already_processed: true
      });
    }
    
    // Set a temporary flag to prevent parallel processing
    global[processKey] = true;
    
    try {
      // First check for existing bookings that match this session's metadata
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      // IMPORTANT: Only create booking if payment was successful
      if (session.payment_status !== 'paid') {
        console.log(`Session ${session_id} was not paid:`, session.payment_status);
        delete global[processKey];
        return res.status(400).json({ error: 'Payment not completed' });
      }
      
      // Extract the metadata from the session
      const { 
        camper_id, 
        user_id, 
        start_date, 
        end_date, 
        number_of_guests,
        cost
      } = session.metadata;
      
      // Look for existing bookings that match this session's data
      const existingBookings = await prisma.bookings.findMany({
        where: {
          camper_id: parseInt(camper_id),
          user_id: parseInt(user_id),
          start_date: new Date(start_date),
          end_date: new Date(end_date),
          // Only check recent bookings (created in the last hour)
          created_at: { gte: new Date(Date.now() - 3600000) }
        },
        orderBy: { booking_id: 'desc' }
      });
      
      let booking;
      
      if (existingBookings.length > 0) {
        // Use the existing booking - don't create a duplicate
        booking = existingBookings[0];
        console.log(`Found existing booking ID: ${booking.booking_id} for session: ${session_id}`);
      } else {
        console.log(`Creating new booking for session ${session_id}`);
        
        // Get the actual camping spot price to ensure we use the correct amount
        const campingSpot = await prisma.camping_spot.findUnique({
          where: { camping_spot_id: parseInt(camper_id) }
        });
        
        if (!campingSpot) {
          delete global[processKey];
          return res.status(404).json({ error: 'Camping spot not found' });
        }
        
        // Calculate nights
        const start = new Date(start_date);
        const end = new Date(end_date);
        const nightCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        
        // Calculate correct base price
        const actualBasePrice = campingSpot.price_per_night * nightCount;
        
        // Create a new booking record with correct pricing
        booking = await prisma.bookings.create({
          data: {
            camper_id: parseInt(camper_id),
            user_id: parseInt(user_id),
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            number_of_guests: parseInt(number_of_guests),
            cost: actualBasePrice, // Use the calculated price from the actual spot price
            created_at: new Date(),
            status_id: 2 // CONFIRMED
          }
        });
        
        // Create a transaction record for the payment with total from Stripe
        await prisma.transaction.create({
          data: {
            amount: parseFloat(session.amount_total / 100), // Convert from cents
            status_id: 2, // CONFIRMED
            booking_id: booking.booking_id
          }
        });
        
        console.log(`Created new booking ID ${booking.booking_id} for session ${session_id}`);
      }
      
      // Store the booking ID in the global var to prevent duplicates
      global[processKey] = booking.booking_id;
      
      // Return a simplified response with just what's needed
      return res.json({ 
        booking_id: booking.booking_id 
      });
    } catch (stripeError) {
      delete global[processKey];
      console.error('Stripe session error:', stripeError);
      throw new Error(`Failed to process Stripe session: ${stripeError.message}`);
    }
  } catch (error) {
    console.error('Success route error:', error);
    res.status(500).json({ 
      error: 'Failed to process success page', 
      details: error.message 
    });
  }
});

// Get booking details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'success') {
      return res.status(400).json({ error: 'Valid booking ID is required' });
    }
    
    // Get user ID from authenticated user
    const userId = req.supabaseUser.id;
    
    // Get the internal user ID for the authenticated user
    const userRecord = await prisma.public_users.findFirst({
      where: {
        auth_user_id: userId
      }
    });
    
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: parseInt(id) },
      include: {
        camping_spot: {
          include: {
            images: true,
            location: {
              include: {
                country: true
              }
            },
            owner: true
          }
        },
        status_booking_transaction: true,
        transaction: true
      }
    });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Security check: Users can only access their own bookings or bookings for spots they own
    const isOwner = booking.camping_spot.owner_id === userRecord.user_id;
    const isBooker = booking.user_id === userRecord.user_id;
    
    if (!isBooker && !isOwner) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view this booking' });
    }
    
    res.json(booking);
  } catch (error) {
    console.error('Get booking details error:', error);
    res.status(500).json({ error: 'Failed to get booking details' });
  }
});

// Cancel booking
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id);
    if (isNaN(bookingId)) {
      return res.status(400).json({ error: 'Invalid booking ID' });
    }
    
    // Get user ID from authenticated user
    const userId = req.supabaseUser.id;
    
    // Get the internal user ID for the authenticated user
    const userRecord = await prisma.public_users.findFirst({
      where: {
        auth_user_id: userId
      }
    });
    
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Find the booking first to check permissions
    const existingBooking = await prisma.bookings.findUnique({
      where: { booking_id: bookingId },
      include: { camping_spot: true }
    });
    
    if (!existingBooking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Verify that this user is the owner of the booking
    if (existingBooking.user_id !== userRecord.user_id) {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }
    
    // Check if the booking is already cancelled
    if (existingBooking.status_id === 3) {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }
    
    // Check if the booking is within the cancellation window (48 hours)
    const startDate = new Date(existingBooking.start_date);
    const now = new Date();
    const hoursDiff = (startDate - now) / (1000 * 60 * 60);
    
    if (hoursDiff <= 48) {
      return res.status(400).json({ 
        error: 'Cancellation not allowed within 48 hours of check-in' 
      });
    }
    
    const result = await prisma.$transaction(async (tx) => {
      // Update booking status to cancelled
      const booking = await tx.bookings.update({
        where: { booking_id: bookingId },
        data: { status_id: 3 }, // CANCELLED
        include: {
          transaction: true,
          status_booking_transaction: true,
          camping_spot: {
            include: {
              images: true,
              location: {
                include: {
                  country: true
                }
              },
              owner: true
            }
          }
        }
      });
      
      // Update existing transaction status instead of creating a new one
      if (booking.transaction && booking.transaction.length > 0) {
        await tx.transaction.updateMany({
          where: { booking_id: booking.booking_id },
          data: { status_id: 3 } // CANCELLED
        });
      }
      
      return booking;
    });
    
    console.log(`Booking ${bookingId} cancelled successfully`);
    res.json(result);
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
  }
});

// Debug endpoint for Stripe sessions - useful for troubleshooting
router.get('/debug-session/:sessionId', async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ error: 'This endpoint is only available in development mode' });
    }
    
    const { sessionId } = req.params;
    
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Return sanitized session data
    res.json({
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
      customer: session.customer,
      metadata: session.metadata,
      created: new Date(session.created * 1000).toISOString()
    });
  } catch (error) {
    console.error('Debug session error:', error);
    res.status(500).json({ error: 'Failed to retrieve session', details: error.message });
  }
});

module.exports = router;