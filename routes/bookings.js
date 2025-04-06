const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'eur',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
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
    res.status(500).json({ error: 'Failed to create booking' });
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

module.exports = router;
