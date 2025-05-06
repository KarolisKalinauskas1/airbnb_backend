const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticate } = require('../middlewares/auth');

// CORS helpers
const { applyEmergencyCorsHeaders, logCorsDebugInfo } = require('../utils/cors-helpers');

// Create checkout session for a booking
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    console.log('Create checkout session request body:', req.body);
    
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        details: 'Please log in to continue with your booking'
      });
    }
    
    // Extract required fields from the request
    const { 
      camper_id, 
      user_id,
      start_date, 
      end_date, 
      number_of_guests, 
      cost,
      spot_name,
      spot_image
    } = req.body;
    
    // Basic validation
    if (!camper_id || !user_id || !start_date || !end_date || !number_of_guests) {
      return res.status(400).json({ error: 'Missing required fields for checkout' });
    }

    // Check that camper_id exists
    const campingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(camper_id) },
      include: {
        bookings: {
          where: {
            AND: [
              { status_id: { in: [2, 4, 5] } }, // Confirmed, completed, or unavailable
              {
                OR: [
                  {
                    AND: [
                      { start_date: { lte: new Date(start_date) } },
                      { end_date: { gte: new Date(start_date) } }
                    ]
                  },
                  {
                    AND: [
                      { start_date: { lte: new Date(end_date) } },
                      { end_date: { gte: new Date(end_date) } }
                    ]
                  },
                  {
                    AND: [
                      { start_date: { gte: new Date(start_date) } },
                      { end_date: { lte: new Date(end_date) } }
                    ]
                  }
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
    
    // Prevent owners from booking their own spots - Enhanced check with explicit logging
    console.log('OWNERSHIP CHECK: Comparing user ID with camping spot owner ID');
    console.log('- User ID (from token):', req.user.user_id);
    console.log('- Spot Owner ID:', campingSpot.owner_id);
    
    const userIdNum = parseInt(req.user.user_id);
    const ownerIdNum = parseInt(campingSpot.owner_id);
    
    if (userIdNum === ownerIdNum) {
      console.log('BOOKING BLOCKED: User is the owner of this camping spot');
      return res.status(403).json({
        error: 'You cannot book your own camping spot',
        details: 'Owners are not allowed to book their own camping spots.'
      });
    }
    
    // Also check the user ID from the request body as a backup
    const requestUserIdNum = parseInt(user_id);
    if (requestUserIdNum === ownerIdNum) {
      console.log('BOOKING BLOCKED: Request user ID matches owner ID');
      return res.status(403).json({
        error: 'You cannot book your own camping spot',
        details: 'Owners are not allowed to book their own camping spots.'
      });
    }
    
    // Check for overlapping bookings
    if (campingSpot.bookings && campingSpot.bookings.length > 0) {
      return res.status(400).json({ 
        error: 'Selected dates are not available',
        details: 'These dates have been booked by someone else. Please select different dates.'
      });
    }
    
    // Calculate nights
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
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
    
    // Get the frontend URL from environment variables or use a default
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${frontendUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/camper/${camper_id}`,
      metadata: {
        camper_id,
        user_id,
        start_date,
        end_date,
        number_of_guests
      },
    });
    
    res.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
});

// Handle success route with session_id as query param
router.get('/stripe-success', async (req, res) => {
  // Apply emergency CORS headers for this problematic endpoint
  logCorsDebugInfo(req);
  applyEmergencyCorsHeaders(req, res);
  
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id parameter' });
    }
    
    console.log(`Processing success with session ID: ${session_id}`);
    
    // Set proper content type for API response
    res.setHeader('Content-Type', 'application/json');
    
    // ANTI-DUPLICATE CHECK 1: Check for existing bookings specifically linked to this session ID
    // We'll add an additional query to see if a booking has already been processed for this exact session
    const existingBookingsBySession = await prisma.transaction.findMany({
      where: {
        stripe_session_id: session_id
      },
      include: {
        bookings: true
      }
    });

    // If we found transactions for this session, return the existing booking data
    if (existingBookingsBySession.length > 0 && existingBookingsBySession[0].bookings) {
      console.log(`Found existing booking through session tracking for session: ${session_id}`);
      const existingBooking = existingBookingsBySession[0].bookings;
      return res.json({ 
        already_processed: true,
        booking_id: existingBooking.booking_id,
        start_date: existingBooking.start_date,
        end_date: existingBooking.end_date,
        cost: existingBooking.cost,
        status_id: existingBooking.status_id
      });
    }
    
    // Retrieve the Stripe session to get metadata
    const session = await stripe.checkout.sessions.retrieve(session_id);
    console.log('Retrieved session data:', { 
      id: session.id,
      payment_status: session.payment_status,
      metadata: session.metadata
    });
      
    // Extract the metadata from the session
    const { 
      camper_id, 
      user_id, 
      start_date, 
      end_date, 
      number_of_guests
    } = session.metadata;
      
    // ANTI-DUPLICATE CHECK 2: Look for existing bookings that match this session's data
    const existingBookings = await prisma.bookings.findMany({
      where: {
        camper_id: parseInt(camper_id),
        user_id: parseInt(user_id),
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        created_at: { gte: new Date(Date.now() - 3600000) } // Last hour
      },
      orderBy: { booking_id: 'desc' }
    });
      
    let booking;
      
    if (existingBookings.length > 0) {
      booking = existingBookings[0];
      console.log(`Found existing booking ID: ${booking.booking_id} for session: ${session_id}`);
      
      // ANTI-DUPLICATE CHECK 3: Add session ID to transaction if it wasn't there before
      // This helps with future lookups by session ID
      await prisma.transaction.updateMany({
        where: { booking_id: booking.booking_id },
        data: { stripe_session_id: session_id }
      });
    } else {
      // Use a transaction to ensure database consistency between booking and transaction
      booking = await prisma.$transaction(async (prismaClient) => {
        console.log(`Creating new booking for session ${session_id}`);
        
        // Get the actual camping spot price
        const campingSpot = await prismaClient.camping_spot.findUnique({
          where: { camping_spot_id: parseInt(camper_id) }
        });
          
        if (!campingSpot) {
          throw new Error('Camping spot not found');
        }
          
        // Calculate nights
        const start = new Date(start_date);
        const end = new Date(end_date);
        const nightCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          
        // Calculate base price
        const actualBasePrice = campingSpot.price_per_night * nightCount;
          
        // Create a new booking
        const newBooking = await prismaClient.bookings.create({
          data: {
            camper_id: parseInt(camper_id),
            user_id: parseInt(user_id),
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            number_of_guests: parseInt(number_of_guests),
            cost: actualBasePrice,
            created_at: new Date(),
            status_id: 2 // CONFIRMED
          }
        });
          
        // Create a transaction record with the session ID for future reference
        await prismaClient.transaction.create({
          data: {
            amount: parseFloat(session.amount_total / 100), // Convert from cents
            status_id: 2, // CONFIRMED
            booking_id: newBooking.booking_id,
            stripe_session_id: session_id // Store the session ID for idempotency
          }
        });
          
        console.log(`Created new booking ID ${newBooking.booking_id} for session ${session_id}`);
        return newBooking;
      });
    }
      
    // Return the booking ID for the frontend with more booking details
    return res.json({ 
      booking_id: booking.booking_id,
      start_date: booking.start_date,
      end_date: booking.end_date,
      cost: booking.cost,
      status_id: booking.status_id
    });
  } catch (error) {
    console.error('Success route error:', error);
    res.status(500).json({ 
      error: 'Failed to process success page', 
      details: error.message 
    });
  }
});

// Get bookings for the authenticated owner
// NOTE: This route must be defined BEFORE the '/:id' route to prevent conflicts
router.get('/owner', authenticate, async (req, res) => {
  try {
    console.log('Processing /bookings/owner request');
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if user is owner
    const isOwner = req.user.isowner === 1 || 
                    req.user.isowner === '1' || 
                    req.user.isowner === true ||
                    req.user.isowner === 'true' ||
                    req.user.isowner === 'yes' ||
                    req.user.isowner === 'YES' ||
                    Number(req.user.isowner) === 1;
    
    if (!isOwner) {
      return res.status(403).json({ error: 'Only owners can access this endpoint' });
    }
    
    // Apply CORS headers for this endpoint
    res.setHeader('Content-Type', 'application/json');
    
    // Get all camping spots for this owner
    const ownerCampingSpots = await prisma.camping_spot.findMany({
      where: {
        owner_id: req.user.user_id
      },
      select: {
        camping_spot_id: true
      }
    });
    
    if (ownerCampingSpots.length === 0) {
      // Return empty array if the owner has no camping spots
      return res.json([]);
    }
    
    const campingSpotIds = ownerCampingSpots.map(spot => spot.camping_spot_id);
    
    // Get all bookings for those camping spots
    const bookings = await prisma.bookings.findMany({
      where: {
        camper_id: {
          in: campingSpotIds
        }
      },
      include: {
        camping_spot: {
          select: {
            title: true,
            price_per_night: true,
            camping_spot_id: true,
            images: {
              select: {
                image_url: true
              },
              take: 1
            },
            location: {
              select: {
                city: true,
                country: {
                  select: { name: true }
                }
              }
            }
          }
        },
        users: {
          select: {
            full_name: true,
            email: true
          }
        },
        status_booking_transaction: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    // Add calculated properties to bookings
    const enhancedBookings = bookings.map(booking => {
      // Calculate number of nights
      const startDate = new Date(booking.start_date);
      const endDate = new Date(booking.end_date);
      const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      
      return {
        ...booking,
        nights,
        total_price: parseFloat(booking.cost || 0),
        status: booking.status_booking_transaction?.status || 'unknown'
      };
    });

    res.json(enhancedBookings);
  } catch (error) {
    console.error('Error fetching owner bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings', details: error.message });
  }
});

// Get booking details - PUT THIS AFTER THE /owner ROUTE
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'success') {
      return res.status(400).json({ error: 'Valid booking ID is required' });
    }
    
    // Make sure id is a valid integer
    const bookingId = parseInt(id);
    if (isNaN(bookingId)) {
      return res.status(400).json({ error: 'Booking ID must be a valid number' });
    }
    
    // Must have authenticated user
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: bookingId },
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
    const isOwner = booking.camping_spot.owner_id === req.user.user_id;
    const isBooker = booking.user_id === req.user.user_id;
    
    if (!isBooker && !isOwner) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view this booking' });
    }
    
    res.json(booking);
  } catch (error) {
    console.error('Get booking details error:', error);
    res.status(500).json({ error: 'Failed to get booking details' });
  }
});

// Update booking status
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id);
    if (isNaN(bookingId)) {
      return res.status(400).json({ error: 'Valid booking ID is required' });
    }
    
    // Must have authenticated user
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { status_id } = req.body;
    if (!status_id) {
      return res.status(400).json({ error: 'Status ID is required' });
    }
    
    // Start a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get booking with camping spot owner info
      const booking = await tx.bookings.findUnique({
        where: { booking_id: bookingId },
        include: {
          camping_spot: {
            select: {
              owner_id: true
            }
          },
          transaction: true
        }
      });
      
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      // Security check: Users can only update their own bookings or bookings for spots they own
      const isOwner = booking.camping_spot.owner_id === req.user.user_id;
      const isBooker = booking.user_id === req.user.user_id;
      
      if (!isBooker && !isOwner) {
        throw new Error('Access denied: You do not have permission to update this booking');
      }
      
      // Update booking status
      const updatedBooking = await tx.bookings.update({
        where: { booking_id: bookingId },
        data: { 
          status_id: status_id,
          updated_at: new Date()
        },
        include: {
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
      
      // Update transaction status if it exists
      if (booking.transaction && booking.transaction.length > 0) {
        await tx.transaction.updateMany({
          where: { booking_id: booking.booking_id },
          data: { status_id: status_id }
        });
      }
      
      return updatedBooking;
    });
    
    console.log(`Booking ${bookingId} status updated to ${status_id}`);
    res.json(result);
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Failed to update booking status', details: error.message });
  }
});

module.exports = router;