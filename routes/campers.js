const express = require('express');
const router = express.Router();
const { PrismaClient, PrismaClientInitializationError } = require('@prisma/client');
const prisma = new PrismaClient();
const { geocodeAddress, calculateDistance } = require('../utils/geocoding');
const cloudinary = require('../utils/cloudinary');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { authenticate } = require('../middleware/auth');
const validate = require('../middlewares/validate');
const { cacheMiddleware, clearCache } = require('../middlewares/cache-middleware');
const camperSchemas = require('../schemas/camper-schemas');

// Add logging middleware for all requests
router.use((req, res, next) => {
  console.log(`[campers.js] ${req.method} ${req.path} - Auth header: ${!!req.headers.authorization}`);
  
  // Set proper content-type for all responses
  res.set('Content-Type', 'application/json');
  
  next();
});

// Add route-specific logging for debugging
router.use((req, res, next) => {
  console.log(`[campers.js] Processing route: ${req.method} ${req.path}`);
  next();
});

// IMPORTANT: More specific routes must come BEFORE generic routes with parameters
// Add the /owner route BEFORE the /:id route
router.get('/owner', authenticate, async (req, res) => {
  try {
    console.log('[campers.js] Processing /owner route with auth:', !!req.user);
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if the user is an owner
    const isOwner = req.user.isowner === 1 || req.user.isowner === '1';
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only owners can access their spots'
      });
    }
    
    const userId = req.user.user_id;
    
    // Get all camping spots for this owner
    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: userId
      },
      include: {
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: true
      }
    });
    
    res.json(spots);
  } catch (error) {
    console.error('Error fetching owner camping spots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch camping spots', 
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /camping-spots:
 *   get:
 *     summary: Get available camping spots
 *     tags: [Camping Spots]
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - name: endDate
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of available camping spots
 *       400:
 *         description: Missing required parameters
 */
router.get('/', cacheMiddleware(300), async (req, res) => {
  const { startDate, endDate, lat, lng, radius = 50, ...filters } = req.query;

  console.log(`[campers.js] Search request with params:`, { startDate, endDate, lat, lng, radius, filters });

  if (!startDate || !endDate) {
    return res.status(400).json({ 
      error: 'Start date and end date are required'
    });
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    // Build query with all the necessary WHERE conditions
    const query = {
      where: {
        NOT: {
          bookings: {
            some: {              AND: [
                { start_date: { lte: end } },
                { end_date: { gte: start } },
                { status_id: { in: [2, 5] } } // Only exclude confirmed (2) and unavailable (5)
              ]
            }
          }
        }
      },
      include: {
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        },
        owner: true
      }
    };

    // Add filters
    if (filters.minPrice) {
      query.where.price_per_night = { ...query.where.price_per_night, gte: parseFloat(filters.minPrice) };
    }
    
    if (filters.maxPrice) {
      query.where.price_per_night = { ...query.where.price_per_night, lte: parseFloat(filters.maxPrice) };
    }

    if (filters.guests) {
      query.where.max_guests = { gte: parseInt(filters.guests) };
    }

    if (filters.amenities) {
      query.where.camping_spot_amenities = {
        some: {
          amenity_id: {
            in: filters.amenities.split(',').map(id => parseInt(id))
          }
        }
      };
    }

    let spots;
    
    try {
      spots = await prisma.camping_spot.findMany(query);
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      
      // Check if this is a connection error and use fallback data
      if (dbError instanceof PrismaClientInitializationError || 
          dbError.message.includes("Can't reach database server") || 
          dbError.message.includes("Connection refused")) {
        
        // Use fallback data from utils/fallback-data.js
        try {
          const { getFallbackCampingSpots } = require('../utils/fallback-data');
          spots = getFallbackCampingSpots();
          
          console.log(`Using ${spots.length} fallback camping spots due to database connection error`);
          
          // Apply basic filters to fallback data
          if (filters.minPrice) {
            spots = spots.filter(spot => 
              spot.price_per_night >= parseFloat(filters.minPrice));
          }
          
          if (filters.maxPrice) {
            spots = spots.filter(spot => 
              spot.price_per_night <= parseFloat(filters.maxPrice));
          }
          
          if (filters.guests) {
            spots = spots.filter(spot => 
              spot.max_guests >= parseInt(filters.guests));
          }
          
          // Note: We don't filter by amenities in fallback data for simplicity
        } catch (fallbackError) {
          console.error('Error loading fallback data:', fallbackError);
          return res.status(503).json({ 
            error: 'Database unavailable and no fallback data available',
            dbError: dbError.message
          });
        }
      } else {
        // Not a connection error, pass it up
        throw dbError;
      }
    }

    // Handle location filtering
    if (spots && lat && lng) {
      try {
        const targetLat = parseFloat(lat);
        const targetLng = parseFloat(lng);
        const maxDistance = parseFloat(radius);

        spots = spots.filter(spot => {
          if (!spot.location?.latitute || !spot.location?.longtitute) return false;
          
          try {
            const distance = calculateDistance(
              targetLat,
              targetLng,
              parseFloat(spot.location.latitute),
              parseFloat(spot.location.longtitute)
            );
            return distance <= maxDistance;
          } catch (distanceError) {
            console.error('Distance calculation error:', distanceError);
            return true;
          }
        });
      } catch (filterError) {
        console.error('Location filtering error:', filterError);
      }
    }

    res.json(spots);
  } catch (error) {
    console.error('Search Error:', error);
    return res.status(500).json({ 
      error: 'Failed to search camping spots',
      details: error.message,
      databaseStatus: 'unavailable'
    });
  }
});

// Get amenities - PUBLIC ENDPOINT
router.get('/amenities', cacheMiddleware(300), async (req, res) => {
  try {
    let amenities;
    
    try {
      amenities = await prisma.amenity.findMany();
    } catch (dbError) {
      console.error('Database connection error when fetching amenities:', dbError);
      
      // Use fallback data if connection issue
      if (dbError instanceof PrismaClientInitializationError || 
          dbError.message.includes("Can't reach database server") || 
          dbError.message.includes("Connection refused")) {
        const { getFallbackAmenities } = require('../utils/fallback-data');
        amenities = getFallbackAmenities();
        console.log(`Using fallback amenities due to database connection error`);
      } else {
        throw dbError; // Rethrow if not a connection error
      }
    }
    
    res.json(amenities);
  } catch (error) {
    console.error('Amenities Error:', error);
    return res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

// Get countries - PUBLIC ENDPOINT
router.get('/countries', cacheMiddleware(300), async (req, res) => {
  try {
    let countries;
    
    try {
      countries = await prisma.country.findMany();
    } catch (dbError) {
      console.error('Database connection error when fetching countries:', dbError);
      
      // Use fallback data if connection issue
      if (dbError instanceof PrismaClientInitializationError || 
          dbError.message.includes("Can't reach database server") || 
          dbError.message.includes("Connection refused")) {
        const { getFallbackCountries } = require('../utils/fallback-data');
        countries = getFallbackCountries();
        console.log(`Using fallback countries due to database connection error`);
      } else {
        throw dbError; // Rethrow if not a connection error
      }
    }
    
    res.json(countries);
  } catch (error) {
    console.error('Countries Error:', error);
    return res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

// Add a specific debugging endpoint
router.get('/debug/auth-status', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  res.json({
    hasAuthHeader: !!req.headers.authorization,
    tokenPrefix: token ? `${token.substring(0, 10)}...` : null,
    authenticated: !!req.user,
    user: req.user ? {
      id: req.user.user_id,
      email: req.user.email
    } : null
  });
});

// The generic /:id route should be LAST
router.get('/:id', cacheMiddleware(300), async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  try {
    let spot;
    
    try {
      // Fix: Ensure id is parsed as integer and properly provided to the query
      const spotId = parseInt(id);
      
      if (isNaN(spotId)) {
        return res.status(400).json({ error: 'Invalid camping spot ID' });
      }
      
      spot = await prisma.camping_spot.findUnique({
        where: {
          camping_spot_id: spotId // Fixed: properly provide the camping_spot_id
        },
        include: {
          images: true,
          location: {
            include: { country: true }
          },
          camping_spot_amenities: {
            include: { amenity: true }
          },
          owner: true,
          bookings: true
        }
      });
    } catch (dbError) {
      console.error('Database connection error when fetching camping spot:', dbError);
      
      // Use fallback data if connection issue
      if (dbError instanceof PrismaClientInitializationError || 
          dbError.message.includes("Can't reach database server") || 
          dbError.message.includes("Connection refused")) {
        const { getFallbackCampingSpots } = require('../utils/fallback-data');
        const spots = getFallbackCampingSpots();
        spot = spots.find(s => s.camping_spot_id === parseInt(id));
        console.log(`Using fallback camping spot due to database connection error`);
      } else {
        throw dbError; // Rethrow if not a connection error
      }
    }

    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    res.json(spot);
  } catch (error) {
    console.error('Get Single Spot Error:', error);
    return res.status(500).json({ error: 'Failed to fetch camping spot', details: error.message });
  }
});

// Create a new camping spot
router.post('/', authenticate, upload.array('images'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Parse JSON strings back to objects
    const location = JSON.parse(req.body.location);
    const amenities = JSON.parse(req.body.amenities || '[]');

    // Create the camping spot
    const newSpot = await prisma.camping_spot.create({
      data: {
        title: req.body.title,
        description: req.body.description,
        price_per_night: parseFloat(req.body.price_per_night),
        max_guests: parseInt(req.body.max_guests),
        owner_id: parseInt(req.body.owner_id),
        location: {
          create: {
            address_line1: location.address_line1,
            address_line2: location.address_line2,
            city: location.city,
            country_id: location.country_id,
            postal_code: location.postal_code
          }
        },
        camping_spot_amenities: {
          create: amenities.map(amenityId => ({
            amenity_id: amenityId
          }))
        }
      },
      include: {
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        }
      }
    });

    // Handle image uploads if any
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(file => {
        // Convert file buffer to base64
        const base64Image = file.buffer.toString('base64');
        
        return prisma.camping_spot_image.create({
          data: {
            camping_spot_id: newSpot.camping_spot_id,
            image_data: base64Image,
            image_type: file.mimetype
          }
        });
      });

      await Promise.all(imagePromises);
    }

    // Fetch the complete spot with all relations
    const completeSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: newSpot.camping_spot_id },
      include: {
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        }
      }
    });

    res.status(201).json(completeSpot);
  } catch (error) {
    console.error('Error creating camping spot:', error);
    res.status(500).json({ 
      error: 'Failed to create camping spot', 
      details: error.message 
    });
  }
});

module.exports = router;