const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../src/middleware/auth');

// IMPORTANT: Place all public endpoints BEFORE applying authentication middleware

// Get reviews for a camping spot - DEPRECATED - provides redirect to new path
router.get('/spot/:id', async (req, res) => {
  res.status(301).json({
    error: 'Endpoint moved',
    message: 'This endpoint is deprecated. Please use /api/camping-spots/:id/reviews instead.'
  });
});

// Get review statistics for a camping spot (public endpoint - no auth required)
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

// Diagnostic endpoint to test if reviews API is accessible
router.get('/health', (req, res) => {
  console.log("[REVIEWS API] Health check called");
  res.json({
    status: 'ok',
    message: 'Reviews API is working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
