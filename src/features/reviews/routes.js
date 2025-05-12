const express = require('express');
const router = express.Router();
const { authenticate } = require('../modules/auth/middleware/auth.middleware');
const { prisma } = require('../config');

// Apply authentication middleware to all routes
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

// Create a new review
router.post('/', async (req, res) => {
  try {
    const { campingSpotId, rating, comment } = req.body;

    // Check if the camping spot exists
    const campingSpot = await prisma.campingSpot.findUnique({
      where: { id: parseInt(campingSpotId) }
    });

    if (!campingSpot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    const user = await prisma.user.findUnique({
      where: { auth_user_id: req.user.id }
    });

    // Check if the user has already reviewed this camping spot
    const existingReview = await prisma.review.findFirst({
      where: {
        userId: user.id,
        campingSpotId: parseInt(campingSpotId)
      }
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this camping spot' });
    }

    // Check if the user has booked this camping spot
    const booking = await prisma.booking.findFirst({
      where: {
        userId: user.id,
        campingSpotId: parseInt(campingSpotId),
        endDate: {
          lt: new Date()
        }
      }
    });

    if (!booking) {
      return res.status(403).json({ error: 'You can only review camping spots you have stayed at' });
    }

    const review = await prisma.review.create({
      data: {
        rating: parseInt(rating),
        comment,
        userId: user.id,
        campingSpotId: parseInt(campingSpotId)
      },
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

    res.status(201).json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a review
router.put('/:id', async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const user = await prisma.user.findUnique({
      where: { auth_user_id: req.user.id }
    });

    const review = await prisma.review.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Only allow the review author to update
    if (review.userId !== user.id) {
      return res.status(403).json({ error: 'Not authorized to update this review' });
    }

    const updatedReview = await prisma.review.update({
      where: { id: parseInt(req.params.id) },
      data: {
        rating: parseInt(rating),
        comment
      },
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
    res.status(400).json({ error: error.message });
  }
});

module.exports = router; 