const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middlewares/auth');
const prisma = require('../config/prisma');

console.log('[REVIEWS ROUTES] Loading reviews routes...');

// Debug: Log all routes being registered
router.use((req, res, next) => {
  console.log('[REVIEWS DEBUG] Incoming request:', req.method, req.path, req.url);
  next();
});

// Public endpoint for review statistics - placed BEFORE authentication middleware
router.get('/stats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Getting review stats for camping spot ID: ${id}`);
    
    // Use a direct join approach with Prisma
    const reviews = await prisma.review.findMany({
      where: {
        bookings: {
          camper_id: parseInt(id)
        }
      },
      select: {
        rating: true
      }
    });
    
    console.log(`Direct stats query found ${reviews.length} reviews for camping spot ${id}`);
    
    if (reviews.length === 0) {
      return res.json({
        count: 0,
        average: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      });
    }
    
    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;
    
    // Calculate rating distribution
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(review => {
      if (distribution[review.rating] !== undefined) {
        distribution[review.rating]++;
      }
    });
    
    res.json({
      count: reviews.length,
      average: parseFloat(averageRating.toFixed(1)),
      distribution
    });
  } catch (error) {
    console.error('Review Stats Error:', error);
    res.status(500).json({ error: 'Failed to fetch review statistics' });
  }
});

// Apply authentication middleware to all routes AFTER the public endpoint
router.use((req, res, next) => {
  console.log('[REVIEWS MIDDLEWARE] Request to:', req.method, req.path, 'at', new Date().toISOString());
  next();
});

// Test route to verify reviews router is working
router.get('/test', (req, res) => {
  console.log('[REVIEWS TEST] Test route accessed');
  res.json({ message: 'Reviews router is working', timestamp: new Date().toISOString() });
});

router.use(authenticate);

// Get all reviews for a camping spot
router.get('/camping-spot/:campingSpotId', async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { campingSpotId: parseInt(req.params.campingSpotId) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single review
router.get('/:id', async (req, res) => {
  try {
    const review = await prisma.review.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get review by booking ID - this is what the frontend expects when checking for existing reviews
router.get('/booking/:id', async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id);
    console.log('[REVIEW GET BY BOOKING] Request received for booking ID:', bookingId);

    // Check if the booking exists and belongs to the user
    const booking = await prisma.bookings.findUnique({
      where: { 
        booking_id: bookingId
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify the user is the owner of the booking
    if (booking.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'You can only view reviews for your own bookings' });
    }

    // Find existing review for this booking
    const existingReview = await prisma.review.findFirst({
      where: {
        booking_id: bookingId
      }
    });

    if (!existingReview) {
      return res.status(404).json({ error: 'No review found for this booking' });
    }

    console.log('[REVIEW GET BY BOOKING] Found existing review:', existingReview);
    res.json(existingReview);
  } catch (error) {
    console.error('[REVIEW GET BY BOOKING] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new review for a specific booking - this is what the frontend expects
router.post('/booking/:id', async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id);
    console.log('[REVIEW CREATE BY BOOKING] Request received:', {
      bookingId,
      body: req.body,
      user: req.user ? { user_id: req.user.user_id, email: req.user.email } : 'No user',
      headers: {
        authorization: req.headers.authorization ? 'Present' : 'Missing',
        'content-type': req.headers['content-type']
      }
    });

    const { rating, comment } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      console.log('[REVIEW CREATE BY BOOKING] ERROR: Invalid rating:', rating);
      return res.status(400).json({ error: 'Valid rating (1-5) is required' });
    }

    // Check if the booking exists and belongs to the user
    const booking = await prisma.bookings.findUnique({
      where: { 
        booking_id: bookingId
      },
      include: {
        camping_spot: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify the user is the owner of the booking
    if (booking.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'You can only review your own bookings' });
    }

    // Check if the booking is completed (end date is in the past)
    const endDate = new Date(booking.end_date);
    const now = new Date();
    if (endDate > now) {
      return res.status(400).json({ error: 'You can only review completed bookings' });
    }

    // Check if the user has already reviewed this booking
    const existingReview = await prisma.review.findFirst({
      where: {
        booking_id: bookingId
      }
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this booking' });
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        booking_id: bookingId,
        user_id: req.user.user_id,
        rating: parseInt(rating),
        comment: comment || null,
        created_at: new Date()
      }
    });

    console.log('[REVIEW CREATE BY BOOKING] SUCCESS: Created review:', review);
    res.status(201).json(review);
  } catch (error) {
    console.error('[REVIEW CREATE BY BOOKING] ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new review (alternative endpoint)
router.post('/', async (req, res) => {
  try {
    console.log('[REVIEW CREATE] Request received:', {
      body: req.body,
      user: req.user ? { user_id: req.user.user_id, email: req.user.email } : 'No user',
      headers: {
        authorization: req.headers.authorization ? 'Present' : 'Missing',
        'content-type': req.headers['content-type']
      }
    });

    const { booking_id, rating, comment } = req.body;
    
    if (!booking_id) {
      console.log('[REVIEW CREATE] ERROR: Missing booking_id');
      return res.status(400).json({ error: 'Booking ID is required' });
    }
    
    if (!rating || rating < 1 || rating > 5) {
      console.log('[REVIEW CREATE] ERROR: Invalid rating:', rating);
      return res.status(400).json({ error: 'Valid rating (1-5) is required' });
    }

    // Check if the booking exists and belongs to the user
    const booking = await prisma.bookings.findUnique({
      where: { 
        booking_id: parseInt(booking_id)
      },
      include: {
        camping_spot: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify the user is the owner of the booking
    if (booking.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'You can only review your own bookings' });
    }

    // Check if the booking is completed (end date is in the past)
    const endDate = new Date(booking.end_date);
    const now = new Date();
    if (endDate > now) {
      return res.status(400).json({ error: 'You can only review completed bookings' });
    }

    // Check if the user has already reviewed this booking
    const existingReview = await prisma.review.findFirst({
      where: {
        booking_id: parseInt(booking_id)
      }
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this booking' });
    }

    if (!booking) {
      return res.status(403).json({ error: 'You can only review camping spots you have stayed at' });
    }    const review = await prisma.review.create({
      data: {
        booking_id: parseInt(booking_id),
        user_id: req.user.user_id,
        rating: parseInt(rating),
        comment: comment || null,
        created_at: new Date()
      }
    });

    res.status(201).json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a review
router.put('/:id', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const reviewId = parseInt(req.params.id);

    // Check if review exists
    const review = await prisma.review.findUnique({
      where: { review_id: reviewId },
      include: {
        booking: true
      }
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Only allow the review author to update
    if (review.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Not authorized to update this review' });
    }

    const updatedReview = await prisma.review.update({
      where: { review_id: reviewId },
      data: {
        rating: parseInt(rating),
        comment: comment || null
      }
    });

    res.json(updatedReview);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a review
router.delete('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { auth_user_id: req.user.id }
    });

    const review = await prisma.review.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Only allow the review author to delete
    if (review.userId !== user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this review' });
    }

    await prisma.review.delete({
      where: { id: parseInt(req.params.id) }
    });

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });  }
});

module.exports = router;