const express = require('express');
const router = express.Router();
const prisma = require('../config/database').prisma;

// Basic health check endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Get all amenities through both paths for backward compatibility
router.get('/amenities', async (req, res) => {
  try {
    const amenities = await prisma.amenity.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(amenities);
  } catch (error) {
    console.error('Error fetching amenities:', error);
    res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

router.get('/camping-spots/amenities', async (req, res) => {
  try {
    const amenities = await prisma.amenity.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(amenities);
  } catch (error) {
    console.error('Error fetching amenities:', error);
    res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

// Get all countries through both paths for backward compatibility
router.get('/countries', async (req, res) => {
  try {
    const countries = await prisma.country.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(countries);
  } catch (error) {
    console.error('Error fetching countries:', error);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

router.get('/camping-spots/countries', async (req, res) => {
  try {
    const countries = await prisma.country.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(countries);
  } catch (error) {
    console.error('Error fetching countries:', error);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

module.exports = router;
