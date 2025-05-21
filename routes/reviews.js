const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../src/middleware/auth');

// Get all reviews for a camping spot (public endpoint - no auth required)
router.get('/spot/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const reviews = await prisma.review.findMany({
      where: {
        booking: {
          camper_id: parseInt(id)
        }
      },
      include: {
        booking: {
          include: {
            users: {
              select: {
                full_name: true,
                user_id: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    // Format reviews for response
    const formattedReviews = reviews.map(review => ({
      review_id: review.review_id,
      booking_id: review.booking_id,
      rating: review.rating,
      comment: review.comment,
      created_at: review.created_at,
      user: review.booking.users
    }));
    
    res.json(formattedReviews);
  } catch (error) {
    console.error('Get Reviews Error:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Create a new review
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('========== REVIEW SUBMISSION START ==========');
    console.log('Review submission request received:', req.body);
    
    const { booking_id, rating, comment } = req.body;
    
    if (!booking_id || booking_id === undefined) {
      console.error('Missing booking_id in request:', req.body);
      return res.status(400).json({ error: 'Booking ID is required' });
    }
    
    if (!rating) {
      console.error('Missing rating in request for booking_id:', booking_id);
      return res.status(400).json({ error: 'Rating is required' });
    }
    
    // Log the authenticated user
    console.log(`User ${req.user.user_id} (${req.user.email}) attempting to create a review for booking ${booking_id}`);
    
    // Verify the booking exists and belongs to the authenticated user
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: parseInt(booking_id) },
      include: { 
        users: true,
        status_booking_transaction: true 
      }
    });
    
    console.log('Booking found:', booking ? `ID: ${booking.booking_id}, User: ${booking.user_id}, Status: ${booking.status_id}` : 'Not found');
    
    if (!booking) {
      console.error(`Review blocked: Booking ID ${booking_id} not found in database`);
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Check if the booking is confirmed or completed
    console.log(`Booking status check: status_id = ${booking.status_id}`);
    console.log(`Booking status name: ${booking.status_booking_transaction?.status || 'Unknown'}`);
    
    if (booking.status_id !== 4 && booking.status_id !== 1) {
      console.error(`Review blocked: Booking ${booking.booking_id} has invalid status ${booking.status_id}`);
      return res.status(400).json({ error: 'Can only review confirmed or completed bookings (status must be 1 or 4)' });
    }
      // Check if the booking is in the past
    const bookingEndDate = new Date(booking.end_date);
    const currentDate = new Date();
    console.log(`Date check: End date = ${bookingEndDate.toISOString()}, Current date = ${currentDate.toISOString()}`);
    console.log(`Is booking in the past? ${bookingEndDate <= currentDate ? 'Yes' : 'No'}`);
    
    if (bookingEndDate > currentDate) {
      console.error(`Review blocked: Booking ${booking.booking_id} end date (${bookingEndDate.toISOString()}) is in the future`);
      return res.status(400).json({ error: 'Can only review bookings that have already ended' });
    }
    
    // Check if the logged-in user owns this booking
    console.log(`Ownership check: Booking user_id = ${booking.user_id}, Current user_id = ${req.user.user_id}`);
    console.log(`User IDs match? ${booking.user_id === req.user.user_id ? 'Yes' : 'No'}`);
    
    if (booking.user_id !== req.user.user_id) {
      console.error(`Review blocked: User ${req.user.user_id} does not own booking ${booking.booking_id}`);
      return res.status(403).json({ error: 'You do not have permission to review this booking' });
    }
    
    // Check if review already exists for this booking
    console.log(`Checking for existing review for booking ${booking_id}`);
    
    try {
      const existingReview = await prisma.review.findUnique({
        where: { booking_id: parseInt(booking_id) }
      });
      
      console.log('Existing review query result:', existingReview);
      
      if (existingReview) {
        console.log(`Existing review found: ID ${existingReview.review_id}, Rating ${existingReview.rating}`);
        
        // If the review exists but is a placeholder (rating = 0), update it instead of creating a new one
        if (existingReview.rating === 0) {
          try {
            console.log(`Updating placeholder review ${existingReview.review_id} with real rating ${rating}`);
            const updatedReview = await prisma.review.update({
              where: { review_id: existingReview.review_id },
              data: {
                rating: parseInt(rating),
                comment: comment || null,
                created_at: new Date() // Update the created_at date to when the real review was submitted
              }
            });
            
            console.log(`Review successfully updated: ${updatedReview.review_id}`);
            console.log('========== REVIEW SUBMISSION END ==========');
            return res.status(200).json(updatedReview);
          } catch (updateError) {
            console.error('Error updating review:', updateError);
            return res.status(500).json({ error: 'Error updating review', details: updateError.message });
          }
        } else {
          console.error(`Review blocked: Review already exists for booking ${booking_id} with rating ${existingReview.rating}`);
          return res.status(400).json({ error: 'Review already exists for this booking' });
        }
      }
    } catch (findError) {
      console.error('Error checking for existing review:', findError);
      return res.status(500).json({ error: 'Error checking for existing review', details: findError.message });
    }
      console.log(`No existing review found for booking ${booking_id}, proceeding with creation`);
    
    // Create the review
    try {
      const review = await prisma.review.create({
        data: {
          booking_id: parseInt(booking_id),
          user_id: booking.user_id,
          rating: parseInt(rating),
          comment: comment || null,
          created_at: new Date()
        }
      });
      
      console.log(`New review created: ID ${review.review_id}`);
      console.log('========== REVIEW SUBMISSION END ==========');
      return res.status(201).json(review);
    } catch (createError) {
      console.error('Error creating review:', createError);
      return res.status(500).json({ error: 'Failed to create review', details: createError.message });
    }
    
  } catch (error) {
    console.error('Create Review Error:', error);
    console.log('========== REVIEW SUBMISSION ERROR ==========');
    return res.status(500).json({ error: 'Failed to create review' });
  }
});

// Update a review
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    
    if (!rating) {
      return res.status(400).json({ error: 'Rating is required' });
    }
    
    // Check if review exists
    const review = await prisma.review.findUnique({
      where: { review_id: parseInt(id) },
      include: {
        booking: {
          include: { users: true }
        }
      }
    });
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    // Check if the logged-in user owns this review
    if (review.booking.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'You do not have permission to update this review' });
    }
      // Check if booking is confirmed or completed
    if (review.booking.status_id !== 4 && review.booking.status_id !== 1) {
      return res.status(400).json({ error: 'Can only update reviews for confirmed or completed bookings' });
    }
    
    // Check if the booking is in the past
    const bookingEndDate = new Date(review.booking.end_date);
    const currentDate = new Date();
    if (bookingEndDate > currentDate) {
      return res.status(400).json({ error: 'Can only review bookings that have already ended' });
    }
    
    // Update the review
    const updatedReview = await prisma.review.update({
      where: { review_id: parseInt(id) },
      data: {
        rating: parseInt(rating),
        comment: comment || null,
        updated_at: new Date()
      }
    });
    
    res.json(updatedReview);
  } catch (error) {
    console.error('Update Review Error:', error);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Delete a review
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if review exists
    const review = await prisma.review.findUnique({
      where: { review_id: parseInt(id) },
      include: {
        booking: {
          include: { users: true }
        }
      }
    });
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    // Delete the review
    await prisma.review.delete({
      where: { review_id: parseInt(id) }
    });
    
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete Review Error:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Get review statistics for a camping spot
router.get('/stats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const reviews = await prisma.review.findMany({
      where: {
        booking: {
          camper_id: parseInt(id)
        }
      },
      select: {
        rating: true
      }
    });
    
    if (reviews.length === 0) {
      return res.json({
        count: 0,
        average: 0,
        distribution: {
          5: 0,
          4: 0,
          3: 0,
          2: 0,
          1: 0
        }
      });
    }
    
    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / reviews.length;
    
    // Calculate rating distribution
    const distribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    };
    
    reviews.forEach(review => {
      distribution[review.rating] += 1;
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

// Get a review by booking ID
router.get('/booking/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Only allow users to access their own reviews
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: parseInt(id) },
      include: { users: true }
    });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Check if the logged-in user owns this booking
    if (booking.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'You do not have permission to access this review' });
    }
    
    // Find the review for this booking
    const review = await prisma.review.findUnique({
      where: { booking_id: parseInt(id) }
    });
    
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    res.json(review);
  } catch (error) {
    console.error('Get Review by Booking Error:', error);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

module.exports = router;
