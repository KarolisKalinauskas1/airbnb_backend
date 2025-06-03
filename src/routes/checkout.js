const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { prisma } = require('../config/prisma');

/**
 * @route POST /api/checkout/create-session
 * @desc Create a Stripe checkout session for booking
 * @access Private
 */
router.post('/create-session', async (req, res) => {
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

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: spot_name || 'Camping Spot Booking',
              description: `Booking from ${new Date(start_date).toLocaleDateString()} to ${new Date(end_date).toLocaleDateString()} for ${number_of_guests} guests`
            },
            unit_amount: Math.round(total * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/campers/${camper_id}`,
      metadata: {
        camper_id: String(camper_id),
        user_id: String(user_id),
        start_date: String(start_date),
        end_date: String(end_date),
        number_of_guests: String(number_of_guests),
        cost: String(cost),
        service_fee: String(service_fee || '0'),
        total: String(total)
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

module.exports = router;
