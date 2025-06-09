const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middlewares/auth');
const prisma = require('../config/prisma');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const EmailService = require('../shared/services/email.service');

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
    // Validate authentication
    if (!req.user?.email) {
      console.warn(`[${requestId}] Missing authentication`);
      return res.status(401).json({ error: 'Authentication required' });
    }

    const normalizedEmail = req.user.email.toLowerCase().trim();
    console.log(`[${requestId}] Looking up bookings for email: ${normalizedEmail}`);

    // Find user directly with email first
    let user;
    try {
      user = await prisma.public_users.findUnique({
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
      // Check if it's a connection issue
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
      const bookings = await prisma.public_bookings.findMany({
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
          const cost = parseFloat(booking.cost?.toString() || '0');
          const serviceFee = cost * 0.10; // 10% service fee
          const totalCost = cost + serviceFee;          const startDate = new Date(booking.start_date);
          const endDate = new Date(booking.end_date);
          const now = new Date();
            // Map booking status from status_id, transaction status, and dates
          let status;
          const statusId = booking.status_id;
          const transactionStatus = booking.status_booking_transaction?.status?.toLowerCase();
          
          // Reset time part of dates for comparison
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const bookingStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const bookingEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          
          if (statusId === 3 || transactionStatus === 'cancelled') {
            status = 'cancelled';
          } else if (statusId === 2) {
            if (bookingEndDate < todayStart) {
              status = 'completed';  // Past booking
            } else if (bookingStartDate >= todayStart) {
              status = 'confirmed';  // Future booking or starts today
            } else {
              status = 'confirmed';  // Current/ongoing booking
            }
          } else {
            status = 'pending';
          }
          
          // Debug log
          console.log(`[${requestId}] Booking ${booking.booking_id} status calculation:`, {
            statusId,
            transactionStatus,
            start: bookingStartDate.toISOString(),
            end: bookingEndDate.toISOString(),
            today: todayStart.toISOString(),
            calculatedStatus: status
          });

          return {
            id: booking.booking_id,
            booking_id: booking.booking_id,
            start_date: startDate,
            end_date: endDate,
            number_of_guests: booking.number_of_guests,
            status: status,
            cost: cost,
            service_fee: parseFloat(serviceFee.toFixed(2)),
            total_cost: parseFloat(totalCost.toFixed(2)),
            has_review: booking.review?.review_id != null,
            camping_spot: booking.camping_spot ? {
              camping_spot_id: booking.camping_spot.camping_spot_id,
              id: booking.camping_spot.camping_spot_id,
              title: booking.camping_spot.title,
              description: booking.camping_spot.description,
              price_per_night: booking.camping_spot.price_per_night,
              location: booking.camping_spot.location,
              images: booking.camping_spot.images || []
            } : null,
            created_at: booking.created_at,
            updated_at: booking.updated_at
          };
        } catch (formatError) {
          console.error('Error formatting booking:', {
            error: formatError.message,
            bookingId: booking.booking_id
          });
          return {
            booking_id: booking.booking_id,
            start_date: booking.start_date,
            end_date: booking.end_date,
            status: 'Error',
            cost: 0,
            service_fee: 0,
            total_cost: 0
          };
        }
      });      // Debug: Log all bookings before categorization
      console.log(`[${requestId}] All bookings before categorization:`, formattedBookings.map(b => ({
        id: b.booking_id,
        status: b.status,
        start: b.start_date,
        end: b.end_date
      })));

      // Categorize bookings by status
      const categorizedBookings = {
        upcoming: formattedBookings.filter(booking => 
          booking.status === 'confirmed'
        ).sort((a, b) => new Date(a.start_date) - new Date(b.start_date)),
        previous: formattedBookings.filter(booking => 
          booking.status === 'completed'
        ).sort((a, b) => new Date(b.end_date) - new Date(a.end_date)),
        cancelled: formattedBookings.filter(booking => 
          booking.status === 'cancelled'
        ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      };

      // Debug: Log categorized bookings
      console.log(`[${requestId}] Categorized bookings details:`, {
        all_bookings_count: formattedBookings.length,
        upcoming_details: categorizedBookings.upcoming.map(b => ({
          id: b.booking_id,
          start: b.start_date,
          end: b.end_date,
          status: b.status
        })),
        previous_details: categorizedBookings.previous.map(b => ({
          id: b.booking_id,
          start: b.start_date,
          end: b.end_date,
          status: b.status
        })),
        cancelled_details: categorizedBookings.cancelled.map(b => ({
          id: b.booking_id,
          start: b.start_date,
          end: b.end_date,
          status: b.status
        }))
      });

      console.log(`[${requestId}] Successfully categorized bookings:`, {
        total: formattedBookings.length,
        upcoming: categorizedBookings.upcoming.length,
        previous: categorizedBookings.previous.length,
        cancelled: categorizedBookings.cancelled.length
      });

      return res.json(categorizedBookings);

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
        users: {          select: {
            full_name: true,
            email: true
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
      const user = await prisma.users.findUnique({
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
    const user = await prisma.users.findUnique({
      where: { email: req.user.email }
    });

    const booking = await prisma.bookings.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check authorization using user_id from our database
    if (booking.user_id !== user.user_id) {
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

    // Get user by email first
    const user = await prisma.users.findUnique({
      where: { email: req.user.email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

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
      where: { email: req.user.email }
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
      where: { email: req.user.email }
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
      const fullUser = await prisma.users.findUnique({
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
    const cost = parseFloat(bookingData.cost);
    if (isNaN(cost) || cost <= 0) {
      return res.status(400).json({ error: 'Invalid cost amount' });
    }
    const serviceFee = bookingData.service_fee ? parseFloat(bookingData.service_fee) : (cost * 0.1);
    if (isNaN(serviceFee) || serviceFee < 0) {
      return res.status(400).json({ error: 'Invalid service fee amount' });
    }
    bookingData.total = cost + serviceFee;
    bookingData.service_fee = serviceFee;
  }
  
  // Validate all required fields for a booking
  const requiredFields = ['camper_id', 'user_id', 'start_date', 'end_date', 'number_of_guests', 'total'];
  const missingFields = requiredFields.filter(field => bookingData[field] === undefined || bookingData[field] === null || bookingData[field] === '');
  
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      error: `Missing or empty required fields: ${missingFields.join(', ')}`,
      received: bookingData
    });
  }
  
  // Validate data types and values
  try {
    // Validate dates
    const startDate = new Date(bookingData.start_date);
    const endDate = new Date(bookingData.end_date);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for start_date or end_date' });
    }
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    
    // Validate and parse numeric fields
    bookingData.camper_id = parseInt(bookingData.camper_id);
    bookingData.user_id = parseInt(bookingData.user_id);
    bookingData.total = parseFloat(bookingData.total);
    bookingData.number_of_guests = parseInt(bookingData.number_of_guests);

    if (isNaN(bookingData.camper_id) || bookingData.camper_id <= 0) {
      return res.status(400).json({ error: 'Invalid camper_id, must be a positive integer' });
    }
    if (isNaN(bookingData.user_id) || bookingData.user_id <= 0) {
      return res.status(400).json({ error: 'Invalid user_id, must be a positive integer' });
    }
    if (isNaN(bookingData.total) || bookingData.total <= 0) {
      return res.status(400).json({ error: 'Total must be a positive number' });
    }
    if (isNaN(bookingData.number_of_guests) || bookingData.number_of_guests <= 0 || !Number.isInteger(bookingData.number_of_guests)) {
      return res.status(400).json({ error: 'Number of guests must be a positive integer' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Invalid data format', details: error.message });
  }
  
  try {
    // Ensure there's a valid Stripe API key
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Payment service configuration error' });
    }

    // Create metadata with string values as required by Stripe
    const metadata = {
      camper_id: String(bookingData.camper_id),
      user_id: String(bookingData.user_id),
      start_date: String(bookingData.start_date),
      end_date: String(bookingData.end_date),
      number_of_guests: String(bookingData.number_of_guests),
      cost: String(bookingData.cost || '0'),
      service_fee: String(bookingData.service_fee || '0'),
      total: String(bookingData.total)
    };

    // Create the Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: bookingData.spot_name,
              description: `Booking from ${new Date(bookingData.start_date).toLocaleDateString()} to ${new Date(bookingData.end_date).toLocaleDateString()} for ${bookingData.number_of_guests} guests`
            },
            unit_amount: Math.round(bookingData.total * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/campers/${bookingData.camper_id}`,
      metadata
    });

    return res.json({ 
      url: session.url,
      session_id: session.id,
      status: 'success'
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    // Add specific error handling for common Stripe issues
    if (error.type === 'StripeInvalidRequestError') {
      if (error.message.includes('valid integer')) {
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

module.exports = router;