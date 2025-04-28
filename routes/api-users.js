/**
 * API-specific user routes to ensure proper content negotiation
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import auth middleware with fallback
let authenticate;
try {
  authenticate = require('../middlewares/auth').authenticate;
} catch (e) {
  authenticate = require('../middleware/auth').authenticate;
}

/**
 * Force all responses to be JSON
 */
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

/**
 * @route   GET /api-users/profile
 * @desc    Get full user info from auth token (guaranteed JSON response)
 * @access  Private
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    // Always set JSON content type
    res.setHeader('Content-Type', 'application/json');
    
    // If we have user data from authentication middleware, return it
    if (req.user) {
      // Format the data
      const userData = {
        ...req.user,
        // Extract only necessary booking fields to avoid circular references
        bookings: req.user.bookings ? req.user.bookings.map(booking => ({
          booking_id: booking.booking_id,
          start_date: booking.start_date,
          end_date: booking.end_date,
          cost: booking.cost,
          number_of_guests: booking.number_of_guests,
          status_id: booking.status_id || 1,
          created_at: booking.created_at,
          // Include camping spot info for each booking
          camping_spot: booking.camping_spot ? {
            camping_spot_id: booking.camping_spot.camping_spot_id,
            title: booking.camping_spot.title,
            price_per_night: booking.camping_spot.price_per_night,
            image_url: booking.camping_spot.images && booking.camping_spot.images.length > 0 
              ? booking.camping_spot.images[0].image_url 
              : null,
            location: booking.camping_spot.location ? {
              city: booking.camping_spot.location.city,
              country: booking.camping_spot.location.country ? 
                booking.camping_spot.location.country.name : null
            } : null
          } : null,
          status: booking.status_booking_transaction ? 
            booking.status_booking_transaction.status : 'pending'
        })) : []
      };
      
      return res.json(userData);
    }
    
    // If we get here, authentication middleware attached a user but something is wrong
    return res.status(404).json({ error: 'User data not found' });
  } catch (error) {
    console.error('Error in /profile endpoint:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve user data',
      details: error.message
    });
  }
});

// Export the router
module.exports = router;
