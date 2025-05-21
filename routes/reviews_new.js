const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../src/middleware/auth');

// Get all reviews for a camping spot (public endpoint - no auth required)
router.get('/spot/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Searching for reviews with camping spot ID: ${id}`);
    
    // Use a direct join approach with Prisma
    const reviews = await prisma.review.findMany({
      where: {
        bookings: {
          camper_id: parseInt(id)
        }
      },
      include: {
        bookings: {
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
    
    console.log(`Direct join query found ${reviews.length} reviews for camping spot ${id}`);
    
    // Format reviews for response with better error handling
    const formattedReviews = reviews.map(review => {
      try {
        return {
          review_id: review.review_id,
          booking_id: review.booking_id,
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          user: review.bookings?.users || { full_name: 'Anonymous' }
        };
      } catch (err) {
        console.error('Error formatting review:', err);
        return {
          review_id: review.review_id || 0,
          rating: review.rating || 0,
          comment: review.comment || 'No comment provided',
          created_at: review.created_at || new Date(),
          user: { full_name: 'Anonymous' }
        };
      }
    });
    
    console.log('Formatted reviews:', formattedReviews);
    res.json(formattedReviews);
  } catch (error) {
    console.error('Get Reviews Error:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get review statistics for a camping spot
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
