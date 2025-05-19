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
    
    // First, get the basic bookings data
    const bookings = await prisma.bookings.findMany({
      where: { 
        user_id: req.user.user_id
      },
      include: {
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

    // Process each booking individually
    const formattedBookings = [];
    
    for (const booking of bookings) {
      // Separately get the camping spot details to ensure we have the title
      let campingSpotData = null;
      
      try {
        if (booking.camper_id) {
          campingSpotData = await prisma.camping_spot.findUnique({
            where: { camping_spot_id: booking.camper_id },
            include: {
              location: true,
              images: true
            }
          });
          
          console.log(`Found camping spot for booking ${booking.booking_id}: ${campingSpotData?.title || 'NO TITLE'}`);
        } else {
          console.log(`Booking ${booking.booking_id} has no camper_id`);
        }
      } catch (err) {
        console.error(`Error fetching camping spot for booking ${booking.booking_id}:`, err);
      }
      
      const baseCost = parseFloat(booking.cost || 0);
      const serviceFee = parseFloat((baseCost * 0.1).toFixed(2));
      const totalCost = parseFloat((baseCost + serviceFee).toFixed(2));
      
      // Build the formatted booking object with complete spot data
      const formattedBooking = {
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
        spot: campingSpotData ? {
          id: campingSpotData.camping_spot_id,
          name: campingSpotData.title || 'Unnamed Camping Spot',
          title: campingSpotData.title || 'Unnamed Camping Spot',
          description: campingSpotData.description || '',
          price_per_night: campingSpotData.price_per_night || 0,
          location: campingSpotData.location || {},
          images: campingSpotData.images || []
        } : {
          // Default values if no camping spot data is found
          id: booking.camper_id,
          name: 'Unnamed Camping Spot',
          title: 'Unnamed Camping Spot',
          description: '',
          price_per_night: 0,
          location: {},
          images: []
        }
      };
      
      // Add to formatted bookings array
      formattedBookings.push(formattedBooking);
      
      // Extra logging for ID 21
      if (booking.booking_id === 21) {
        console.log('SPECIAL DEBUG - Booking 21:');
        console.log('  Camping spot data:', JSON.stringify(campingSpotData));
        console.log('  Formatted booking:', JSON.stringify(formattedBooking));
      }
    }
    
    console.log(`Processed ${formattedBookings.length} bookings for user ${req.user.user_id}`);
    
    if (formattedBookings.length > 0) {
      // Log the first formatted booking
      console.log('First formatted booking:', JSON.stringify({
        id: formattedBookings[0].id,
        spot: {
          id: formattedBookings[0].spot.id,
          name: formattedBookings[0].spot.name,
          title: formattedBookings[0].spot.title
        }
      }, null, 2));
    }
    
    // Send the formatted bookings to the client
    res.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
