const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middlewares/auth');

// Get all reviews for a camping spot
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
    const { booking_id, rating, comment } = req.body;
    
    if (!booking_id || !rating) {
      return res.status(400).json({ error: 'Booking ID and rating are required' });
    }
    
    // Verify the booking exists and belongs to the authenticated user
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: parseInt(booking_id) },
      include: { users: true }
    });
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Check if review already exists for this booking
    const existingReview = await prisma.review.findFirst({
      where: { booking_id: parseInt(booking_id) }
    });
    
    if (existingReview) {
      return res.status(400).json({ error: 'Review already exists for this booking' });
    }
    
    // Create the review
    const review = await prisma.review.create({
      data: {
        booking_id: parseInt(booking_id),
        rating: parseInt(rating),
        comment: comment || '',
        created_at: new Date()
      }
    });
    
    res.status(201).json(review);
  } catch (error) {
    console.error('Create Review Error:', error);
    res.status(500).json({ error: 'Failed to create review' });
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
    
    // Update the review
    const updatedReview = await prisma.review.update({
      where: { review_id: parseInt(id) },
      data: {
        rating: parseInt(rating),
        comment: comment || review.comment,
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

module.exports = router;
