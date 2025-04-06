const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create checkout session
router.post('/create-checkout-session', async (req, res) => {
  try {
    console.log('Received checkout request with body:', req.body);

    const { 
      camping_spot_id,
      user_id, 
      start_date, 
      end_date, 
      number_of_guests,
      phone_number,
      total
    } = req.body;

    // Validate required fields
    if (!camping_spot_id || !user_id || !start_date || !end_date || !total) {
      console.log('Missing required fields:', { camping_spot_id, user_id, start_date, end_date, total });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Creating Stripe session with amount:', total);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Camping Spot Booking',
            description: `Booking from ${start_date} to ${end_date}`,
          },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success`,
      cancel_url: `${process.env.FRONTEND_URL}/booking-failed`,
      metadata: {
        camping_spot_id,
        user_id,
        start_date,
        end_date,
        number_of_guests,
        phone_number
      }
    });

    console.log('Stripe session created:', session.id);
    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session', 
      details: error.message 
    });
  }
});

// Handle successful payment
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    
    if (session.payment_status === 'paid') {
      // Calculate amounts
      const totalAmount = session.amount_total / 100; // Convert from cents
      const serviceFee = totalAmount * 0.10; // 10% service fee
      const ownerEarnings = totalAmount - serviceFee;

      // Create booking with owner's earnings
      const booking = await prisma.bookings.create({
        data: {
          camper_id: parseInt(session.metadata.camping_spot_id),
          user_id: parseInt(session.metadata.user_id),
          start_date: new Date(session.metadata.start_date),
          end_date: new Date(session.metadata.end_date),
          number_of_guests: parseInt(session.metadata.number_of_guests),
          phone_number: session.metadata.phone_number,
          cost: ownerEarnings, // Owner gets amount minus service fee
          created_at: new Date(),
          status_id: 1 // Confirmed status
        }
      });

      // Create transaction record with full amount
      await prisma.transaction.create({
        data: {
          amount: totalAmount, // Full amount including service fee
          status_id: 1, // Confirmed status
          booking_id: booking.booking_id,
          created_at: new Date()
        }
      });
      
      res.json({ success: true, booking });
    } else {
      res.status(400).json({ error: 'Payment not completed' });
    }
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;
