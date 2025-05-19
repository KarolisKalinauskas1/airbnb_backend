const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { stripeWebhookMiddleware } = require('../middlewares/webhooks');

// Create a webhook endpoint for Stripe events
router.post('/stripe', stripeWebhookMiddleware, async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        await handleCheckoutSessionCompleted(session);
        break;
      case 'checkout.session.async_payment_succeeded':
        const asyncSession = event.data.object;
        await handleCheckoutSessionCompleted(asyncSession);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
  } catch (err) {
    console.error(`Error handling webhook event ${event.type}:`, err);
    res.status(500).json({ error: 'Error processing webhook' });
  }
});

/**
 * Handle completed checkout sessions by creating a booking record
 */
async function handleCheckoutSessionCompleted(session) {
  // Extract the metadata
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

  // Only create booking if payment was successful
  if (session.payment_status !== 'paid') {
    console.log(`Session ${session.id} not paid, status: ${session.payment_status}`);
    return;
  }

  // Check if we've already processed this session
  const existingBookings = await prisma.bookings.findMany({
    where: {
      camper_id: parseInt(camper_id),
      user_id: parseInt(user_id),
      start_date: new Date(start_date),
      end_date: new Date(end_date),
      // Only check recent bookings (within last day)
      created_at: {
        gte: new Date(Date.now() - 86400000) // 24 hours ago
      }
    }
  });

  if (existingBookings.length > 0) {
    console.log(`Session ${session.id} already processed, booking ID:`, existingBookings[0].booking_id);
    return;
  }

  // Get the actual camping spot price to ensure we use the correct amount
  const campingSpot = await prisma.camping_spot.findUnique({
    where: { camping_spot_id: parseInt(camper_id) }
  });
  
  if (!campingSpot) {
    console.error(`Camping spot not found: ${camper_id}`);
    return;
  }
  
  // Calculate nights
  const start = new Date(start_date);
  const end = new Date(end_date);
  const nightCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  // Calculate correct base price
  const actualBasePrice = campingSpot.price_per_night * nightCount;

  // Create the booking record
  const booking = await prisma.bookings.create({
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
  // Create a transaction record for the payment
  await prisma.transaction.create({
    data: {
      amount: parseFloat(session.amount_total / 100), // Convert from cents
      status_id: 2, // CONFIRMED
      booking_id: booking.booking_id
    }
  });

  console.log(`[Webhook] Created booking ID ${booking.booking_id} for session ${session.id}`);
  
  // Send payment confirmation email
  try {
    // Get user details
    const user = await prisma.public_users.findUnique({
      where: { user_id: parseInt(user_id) }
    });

    // Make sure we have the full camping spot details
    const spotDetails = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(camper_id) }
    });
      if (user && spotDetails) {
      // Only send payment email if booking is in CONFIRMED status (2)
      if (booking.status_id === 2) {
        // Import the SimpleGmailService
        const SimpleGmailService = require('../src/shared/services/simple-gmail.service');
        
        // Send payment success email
        const emailSent = await SimpleGmailService.sendPaymentSuccessEmail(
          booking, 
          user, 
          spotDetails, 
          parseFloat(session.amount_total / 100)
        );
            if (emailSent) {
        // Field removed from schema, no need to update database
        
        console.log(`[Webhook] Payment confirmation email sent for booking ID ${booking.booking_id}`);
        }
      } else {
        console.log(`[Webhook] Booking ${booking.booking_id} is not in CONFIRMED status (status: ${booking.status_id}). Not sending payment email.`);
      }
    }
  } catch (emailError) {
    // Don't stop execution if email fails - just log the error
    console.error(`[Webhook] Failed to send payment confirmation email: ${emailError.message}`);
  }
}

module.exports = router;
