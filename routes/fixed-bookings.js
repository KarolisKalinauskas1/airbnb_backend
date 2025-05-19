const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { authenticate } = require('../middlewares/auth');

// CORS helpers
const { applyEmergencyCorsHeaders, logCorsDebugInfo } = require('../utils/cors-helpers');

// Get bookings for the currently logged in user
router.get('/user', authenticate, async (req, res) => {
  try {
    console.log('Getting bookings for user:', req.user?.user_id);
    
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const bookings = await prisma.bookings.findMany({
      where: { 
        user_id: req.user.user_id
      },
      include: {
        camping_spot: {
          include: {
            title: true,
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
    });

    // Debug log to see what we're getting
    console.log('DEBUG - Raw first booking data:', JSON.stringify(bookings[0], null, 2));
    if (bookings[0]?.camping_spot) {
      console.log('DEBUG - Camping spot data:', JSON.stringify({
        id: bookings[0].camping_spot.camping_spot_id,
        title: bookings[0].camping_spot.title
      }, null, 2));
    } else {
      console.log('No camping spot data found in the booking');
    }

    // Format the data for the frontend
    const formattedBookings = bookings.map(booking => {
      const baseCost = parseFloat(booking.cost || 0);
      const serviceFee = parseFloat((baseCost * 0.1).toFixed(2));
      const totalCost = parseFloat((baseCost + serviceFee).toFixed(2));
      
      // Ensure we have the camping spot data
      const campingSpot = booking.camping_spot || {};
      
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
          name: campingSpot.title, // Use title as name
          title: campingSpot.title, // Use the correct title field
          description: campingSpot.description,
          price_per_night: campingSpot.price_per_night,
          location: campingSpot.location,
          images: campingSpot.images || []
        }
      };
    });
    
    console.log(`Found ${formattedBookings.length} bookings for user ${req.user.user_id}`);
    
    // Debug log to see what we're sending to frontend
    if (formattedBookings.length > 0) {
      console.log('DEBUG - First formatted booking spot data:', JSON.stringify({
        id: formattedBookings[0].spot?.id,
        name: formattedBookings[0].spot?.name,
        title: formattedBookings[0].spot?.title
      }, null, 2));
    }
    
    res.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
