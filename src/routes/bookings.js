const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const prisma = require('../config/prisma');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const EmailService = require('../shared/services/email.service');

// Get bookings for the currently logged in user
router.get('/user', authenticate, async (req, res) => {
  try {
    console.log('Getting bookings for user:', req.user?.user_id);
    
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get basic bookings with more explicit selection
    const bookings = await prisma.bookings.findMany({
      where: { 
        user_id: req.user.user_id
      },
      include: {
        camping_spot: {
          select: {
            camping_spot_id: true,
            title: true,
            description: true,
            price_per_night: true,
            location: true,
            images: true
          }
        },
        status_booking_transaction: true,
        review: {
          select: {
            review_id: true,
            rating: true,
            comment: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });    // Format the data for the frontend
    const formattedBookings = bookings.map(booking => {
      const baseCost = parseFloat(booking.cost || 0);
      const serviceFee = parseFloat((baseCost * 0.1).toFixed(2));
      const totalCost = parseFloat((baseCost + serviceFee).toFixed(2));
      
      // Extract camping spot data safely
      const campingSpot = booking.camping_spot || {};
      const spotTitle = campingSpot.title || 'Unnamed Camping Spot';
        // Log for debugging
      console.log(`Booking ${booking.booking_id} has spot title: "${spotTitle}"`);
      
      // Extra debugging for specific booking IDs
      if (booking.booking_id === 21) {
        console.log('SPECIAL DEBUG - Booking 21:');
        console.log('  camping_spot_id:', campingSpot.camping_spot_id);
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
        has_review: !!booking.review,        spot: {
          id: campingSpot.camping_spot_id,
          name: spotTitle, // Use the title as name
          title: spotTitle, // Explicitly include title field
          description: campingSpot.description || '',
          price_per_night: campingSpot.price_per_night || 0,
          location: campingSpot.location || {},
          images: campingSpot.images || []
        }
      };
    });
      console.log(`Found ${formattedBookings.length} bookings for user ${req.user.user_id}`);
    
    // Debug what we're sending
    if (formattedBookings.length > 0) {
      console.log('First formatted booking spot data:', JSON.stringify({
        id: formattedBookings[0].id,
        spot: {
          id: formattedBookings[0].spot?.id,
          name: formattedBookings[0].spot?.name,
          title: formattedBookings[0].spot?.title
        }
      }, null, 2));
    }
    
    res.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    });    // After creating the booking and transaction
    try {
      // Get the full user record for the email
      const user = await prisma.public_users.findUnique({
        where: { user_id: parseInt(user_id) }
      });
      
      if (user) {
        // Import the SimpleGmailService
        const SimpleGmailService = require('../../src/shared/services/simple-gmail.service');
          // Send payment success email with SimpleGmailService (newer implementation)
        await SimpleGmailService.sendPaymentSuccessEmail(
          booking, 
          user, 
          booking.camping_spot,
          parseFloat(total)
        );
        
        // No need to update database field since payment_email_sent was removed from schema
        
        console.log(`Sent payment confirmation email for booking ${booking.booking_id} to ${user.email}`);
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
        transaction: true, // Include transaction data
        review: true // Include review data to show if booking has been reviewed
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
    }    // Only allow the booking owner to cancel
    if (booking.userId !== user.id) {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }

    await prisma.booking.delete({
      where: { id: parseInt(req.params.id) }
    });
    
    // Send cancellation email
    try {
      // Get the full user record for the email
      const fullUser = await prisma.public_users.findUnique({
        where: { user_id: user.id }
      });
      
      if (fullUser) {
        await EmailService.sendBookingCancellation(booking, fullUser);
        console.log(`Sent cancellation email for booking ${booking.id} to ${fullUser.email}`);
      } else {
        console.warn(`User not found for booking cancellation email: ${user.id}`);
      }
    } catch (emailError) {
      console.error('Failed to send booking cancellation email:', emailError);
      // Don't fail the cancellation if email fails
    }

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
      return res.status(403).json({ error: 'You are not authorized to cancel this booking' });
    }

    // Update the booking status to cancelled (status_id 3 = Cancelled)
    const updatedBooking = await prisma.bookings.update({
      where: { booking_id: bookingId },
      data: {
        status_id: 3 // Assuming 3 is the ID for "Cancelled" status
      },
      include: {
        camping_spot: true,
        users: true
      }
    });

    console.log(`Booking ${bookingId} cancelled by user ${req.user.user_id}`);
    
    // Return success response
    res.json({ 
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

// Handle the incorrect endpoint that the frontend is using
router.post('/checkout/create-session', async (req, res) => {
  // Silent processing (remove console logs to avoid noise)
  
  // Extract essential data from the request body
  let data = req.body;
  
  // Handle various ways the frontend might structure the data
  if (req.body.booking) {
    data = req.body.booking;
  } else if (req.body.bookingData) {
    data = req.body.bookingData;
  }

  // Format the request structure to match what the correct endpoint expects
  const bookingData = {
    camper_id: data.camper_id || data.camperId || data.camping_spot_id,
    user_id: data.user_id || data.userId,
    start_date: data.start_date || data.startDate,
    end_date: data.end_date || data.endDate,
    number_of_guests: data.number_of_guests || data.numberOfGuests || 1,
    cost: data.cost || data.base_price || data.baseCost || data.basePrice || 0,
    service_fee: data.service_fee || data.serviceFee || 0,
    total: data.total || data.totalCost || data.totalAmount || 0,
    spot_name: data.spot_name || data.spotName || data.title || 'Camping Spot Booking'
  };

  // If total is missing but we have cost, calculate it
  if (!bookingData.total && bookingData.cost) {
    const serviceFee = bookingData.service_fee || (bookingData.cost * 0.1);
    bookingData.total = parseFloat(bookingData.cost) + parseFloat(serviceFee);
    bookingData.service_fee = serviceFee;
  }
  
  // Validate minimum required fields - camper_id and total are absolute minimum
  const requiredFields = ['camper_id', 'total'];
  const missingFields = requiredFields.filter(field => !bookingData[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      error: `Missing required fields: ${missingFields.join(', ')}`,
      received: bookingData
    });
  }
  
  try {
    // Ensure there's a valid Stripe API key
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Payment service configuration error' });
    }    // Create a safer Stripe checkout session with minimal required data
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: bookingData.spot_name || 'Camping Spot Booking',
            },
            unit_amount: Math.round(bookingData.total * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/campers/${bookingData.camper_id}`
    };

    // Add metadata with validation
    const safeMetadata = {};
    
    // Only include valid fields in metadata
    if (bookingData.camper_id) safeMetadata.camper_id = String(bookingData.camper_id);
    if (bookingData.user_id) safeMetadata.user_id = String(bookingData.user_id);
    if (bookingData.start_date) safeMetadata.start_date = String(bookingData.start_date);
    if (bookingData.end_date) safeMetadata.end_date = String(bookingData.end_date);
    if (bookingData.number_of_guests) safeMetadata.number_of_guests = String(bookingData.number_of_guests);
    if (bookingData.cost) safeMetadata.cost = String(bookingData.cost);
    if (bookingData.service_fee) safeMetadata.service_fee = String(bookingData.service_fee);
    if (bookingData.total) safeMetadata.total = String(bookingData.total);
    
    // Add metadata to session config
    sessionConfig.metadata = safeMetadata;
    
    // Create the session
    const session = await stripe.checkout.sessions.create(sessionConfig);    return res.json({ url: session.url });
  } catch (error) {
    // Handle error without logging to reduce noise
    
    // Add specific error handling for common Stripe issues
    if (error.type === 'StripeInvalidRequestError') {
      if (error.message.includes('valid integer')) {
        // Most common error is the amount not being a valid integer
        return res.status(400).json({ 
          error: 'Invalid payment amount format',
          details: error.message
        });
      }
      return res.status(400).json({ error: `Payment request error: ${error.message}` });
    }
    
    if (error.type === 'StripeAPIError') {
      return res.status(503).json({ error: 'Payment service temporarily unavailable' });
    }
    
    if (error.type === 'StripeAuthenticationError') {
      return res.status(500).json({ error: 'Payment authentication error' });
    }
    
    // Generic error response
    return res.status(500).json({ error: 'Failed to process payment request' });
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