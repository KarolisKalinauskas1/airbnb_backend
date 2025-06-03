const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cacheMiddleware = require('../middleware/cache-middleware').cacheMiddleware;

// Get all amenities (for creating/editing camping spots)
router.get('/', cacheMiddleware(300), async (req, res) => {
  try {
    const amenities = await prisma.amenity.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(amenities);
  } catch (error) {
    console.error('Error fetching all amenities:', error);
    res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

// Get amenities for a specific camping spot
router.get('/:spotId', cacheMiddleware(300), async (req, res) => {
  try {
    const spotId = parseInt(req.params.spotId);
    
    if (isNaN(spotId)) {
      return res.status(400).json({ error: 'Invalid camping spot ID' });
    }

    const campingSpotAmenities = await prisma.camping_spot_amenities.findMany({
      where: {
        camping_spot_id: spotId
      },
      include: {
        amenity: true
      },
      orderBy: {
        amenity: {
          name: 'asc'
        }
      }
    });

    // Transform the response to just return the amenity details
    const amenities = campingSpotAmenities.map(csa => csa.amenity);
    res.json(amenities);
  } catch (error) {
    console.error('Error fetching camping spot amenities:', error);
    res.status(500).json({ error: 'Failed to fetch amenities for this camping spot' });
  }
});

module.exports = router;
