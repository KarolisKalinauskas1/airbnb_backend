const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../utils/cloudinary');
const { prisma } = require('../config');
const { ValidationError, NotFoundError, ForbiddenError } = require('../middleware/error');
const { authenticate } = require('../middleware/auth');
const { geocodeAddress } = require('../../utils/geocoding');
const axios = require('axios');

// Configure multer for memory storage (for Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// Geocoding search endpoint
router.get(['/geocoding/search', '/search'], async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters long' });
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q,
        format: 'json',
        limit: 5,
        addressdetails: 1,
        'accept-language': 'en'
      },
      headers: {
        'User-Agent': 'CampingSpotApp/1.0'
      }
    });

    // Transform the response to match our frontend needs
    const results = response.data.map(result => ({
      display_name: result.display_name,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      address: {
        city: result.address.city || result.address.town || result.address.village || '',
        country: result.address.country || '',
        state: result.address.state || '',
        postcode: result.address.postcode || ''
      }
    }));

    res.json(results);
  } catch (error) {
    console.error('Geocoding search error:', error);
    res.status(500).json({ error: 'Failed to search locations' });
  }
});

// Get all amenities - MUST be before /:id route
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

// Get all countries - MUST be before /:id route
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

// Get all camping spots with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { minPrice, maxPrice, guests, startDate, endDate } = req.query;
    const where = {};

    // Price filter
    if (minPrice || maxPrice) {
      where.price_per_night = {};
      if (minPrice) where.price_per_night.gte = parseFloat(minPrice);
      if (maxPrice) where.price_per_night.lte = parseFloat(maxPrice);
    }

    // Guest capacity filter
    if (guests) {
      where.max_guests = {
        gte: parseInt(guests)
      };
    }

    // Date availability filter
    if (startDate && endDate) {
      where.NOT = {
        bookings: {
          some: {
            AND: [
              { start_date: { lte: new Date(endDate) } },
              { end_date: { gte: new Date(startDate) } }
            ]
          }
        }
      };
    }

    // Exclude owner's own spots if logged in and is owner
    if (req.user && req.user.isowner === 1) {
      where.owner_id = { not: req.user.user_id };
    }

    const spots = await prisma.camping_spot.findMany({
      where,
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
    console.error('Error fetching camping spots:', error);
    next(error);
  }
});

// Get a single camping spot
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const spotId = parseInt(id);
    
    if (isNaN(spotId)) {
      return res.status(400).json({ error: 'Invalid camping spot ID' });
    }
    
    const campingSpot = await prisma.camping_spot.findUnique({
      where: {
        camping_spot_id: spotId
      },
      include: {
        owner: {
          select: {
            owner_id: true,
            license: true
          }
        },
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: {
          where: {
            status_id: {
              not: 5 // Exclude blocked bookings
            }
          },
          select: {
            start_date: true,
            end_date: true,
            status_id: true
          }
        }
      }
    });

    if (!campingSpot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    // Map status IDs to human-readable names and colors
    const statusMap = {
      1: { name: 'Pending', color: 'yellow' },
      2: { name: 'Confirmed', color: 'green' },
      3: { name: 'Cancelled', color: 'red' },
      4: { name: 'Completed', color: 'blue' },
      5: { name: 'Blocked', color: 'gray' }
    };

    // Transform the response to include status names and colors
    const transformedSpot = {
      ...campingSpot,
      bookings: campingSpot.bookings.map(booking => ({
        ...booking,
        status: statusMap[booking.status_id]?.name || 'Unknown',
        statusColor: statusMap[booking.status_id]?.color || 'gray'
      }))
    };

    res.json(transformedSpot);
  } catch (error) {
    console.error('Error fetching camping spot:', error);
    res.status(500).json({ error: 'Failed to fetch camping spot' });
  }
});

// Create a new camping spot - requires authentication
router.post('/', authenticate, upload.array('images'), async (req, res) => {
  try {
    // User must be authenticated (now handled by middleware)
    // If we get here, req.user should be set

    // Parse the location data if it's a string
    let location;
    try {
      location = typeof req.body.location === 'string' ? 
        JSON.parse(req.body.location) : req.body.location;
    } catch (e) {
      console.error('Error parsing location:', e);
      throw new ValidationError('Invalid location data');
    }

    const { title, description, price_per_night, max_guests } = req.body;
    
    if (!title || !description || !price_per_night || !max_guests || !location) {
      console.log('Missing fields:', { title, description, price_per_night, max_guests, location });
      throw new ValidationError('Missing required fields');
    }

    // Get coordinates from address
    const coordinates = await geocodeAddress(location);

    // Create the camping spot first
    const campingSpot = await prisma.camping_spot.create({
      data: {
        title,
        description,
        price_per_night: parseFloat(price_per_night),
        max_guests: parseInt(max_guests),
        created_at: new Date(),
        updated_at: new Date(),
        owner: {
          connect: {
            owner_id: req.user.user_id
          }
        },
        location: {
          create: {
            address_line1: location.address_line1,
            address_line2: location.address_line2 || '',
            city: location.city,
            postal_code: location.postal_code,
            country_id: parseInt(location.country_id),
            longtitute: coordinates.longitude.toString(),
            latitute: coordinates.latitude.toString()
          }
        }
      }
    });

    // Handle amenities if provided
    let amenityIds = [];
    if (req.body.amenities) {
      try {
        amenityIds = typeof req.body.amenities === 'string' 
          ? JSON.parse(req.body.amenities) 
          : req.body.amenities;
        
        console.log('Processing amenities:', amenityIds); // Debug log

        // Create amenity connections
        await prisma.camping_spot_amenities.createMany({
          data: amenityIds.map(amenity_id => ({
            camping_spot_id: campingSpot.camping_spot_id,
            amenity_id: parseInt(amenity_id)
          }))
        });
      } catch (error) {
        console.error('Error processing amenities:', error);
      }
    }

    // Handle image uploads if any
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(async (file) => {
        try {
          // Convert buffer to base64
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          
          console.log('Processing file:', file.originalname); // Debug log
          
          // Upload to Cloudinary
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'camping_spots',
            resource_type: 'auto'
          });

          console.log('Cloudinary upload successful:', result.secure_url); // Debug log

          // Create image record in database
          return prisma.images.create({
            data: {
              camping_id: campingSpot.camping_spot_id,
              image_url: result.secure_url,
              created_at: new Date()
            }
          });
        } catch (error) {
          console.error('Error processing image:', error);
          throw error;
        }
      });

      await Promise.all(uploadPromises);
    }

    // Fetch the complete camping spot with all relations
    const completeSpot = await prisma.camping_spot.findUnique({
      where: { 
        camping_spot_id: campingSpot.camping_spot_id 
      },
      include: {
        owner: {
          select: {
            owner_id: true,
            license: true
          }
        },
        location: true,
        images: true,
        camping_spot_amenities: {
          include: {
            amenity: true
          }
        }
      }
    });

    res.status(201).json(completeSpot);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating camping spot:', error);
    res.status(500).json({ error: 'Failed to create camping spot' });
  }
});

// Update a camping spot
router.put('/:id', authenticate, upload.array('images', 10), async (req, res, next) => {
  try {
    const spotId = parseInt(req.params.id);
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      include: { 
        owner: true,
        location: true,
        images: true,
        camping_spot_amenities: {
          include: {
            amenity: true
          }
        }
      }
    });

    if (!spot) {
      throw new NotFoundError('Camping spot not found');
    }

    // Check if user is the owner
    if (spot.owner_id !== req.user.user_id) {
      throw new ForbiddenError('You are not authorized to edit this camping spot');
    }

    // Parse the location data if it's a string
    let location;
    try {
      location = typeof req.body.location === 'string' ? 
        JSON.parse(req.body.location) : req.body.location;
    } catch (e) {
      console.error('Error parsing location:', e);
      throw new ValidationError('Invalid location data');
    }

    // Check if location fields were updated compared to the existing spot
    const locationUpdated = location && (
      location.address_line1 !== spot.location.address_line1 ||
      location.address_line2 !== spot.location.address_line2 ||
      location.city !== spot.location.city ||
      location.postal_code !== spot.location.postal_code ||
      parseInt(location.country_id) !== spot.location.country_id
    );

    // Always get coordinates if location was updated
    let coordinates = { 
      latitude: spot.location.latitute,
      longitude: spot.location.longtitute 
    };
    
    if (locationUpdated) {
      console.log('Location updated, recalculating coordinates for:', location);
      try {
        const newCoordinates = await geocodeAddress(location);
        if (newCoordinates && newCoordinates.latitude && newCoordinates.longitude) {
          coordinates = newCoordinates;
          console.log('New coordinates calculated:', coordinates);
        } else {
          console.warn('Failed to get coordinates, using fallback geocoding');
        }
      } catch (geocodeError) {
        console.error('Error during geocoding:', geocodeError);
        throw new ValidationError('Could not geocode the provided address. Please check the address and try again.');
      }
    }

    // Start a transaction to ensure all updates are atomic
    const updatedSpot = await prisma.$transaction(async (prisma) => {
      // Update the camping spot and location
      const updatedSpot = await prisma.camping_spot.update({
        where: { camping_spot_id: spotId },
        data: {
          title: req.body.title,
          description: req.body.description,
          price_per_night: parseFloat(req.body.price_per_night),
          max_guests: parseInt(req.body.max_guests),
          location: {
            update: {
              address_line1: location.address_line1,
              address_line2: location.address_line2 || '',
              city: location.city,
              postal_code: location.postal_code,
              country_id: parseInt(location.country_id),
              latitute: coordinates.latitude.toString(),
              longtitute: coordinates.longitude.toString()
            }
          }
        },
        include: {
          owner: {
            select: {
              owner_id: true,
              license: true
            }
          },
          location: true
        }
      });

      // Handle amenities if provided
      if (req.body.amenities) {
        try {
          const amenityIds = typeof req.body.amenities === 'string' 
            ? JSON.parse(req.body.amenities) 
            : req.body.amenities;

          // Delete existing amenities
          await prisma.camping_spot_amenities.deleteMany({
            where: { camping_spot_id: spotId }
          });

          // Create new amenity connections
          await prisma.camping_spot_amenities.createMany({
            data: amenityIds.map(amenity_id => ({
              camping_spot_id: spotId,
              amenity_id: parseInt(amenity_id)
            }))
          });
        } catch (error) {
          console.error('Error processing amenities:', error);
          throw error;
        }
      }

      // Handle image uploads if any
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(async (file) => {
          try {
            // Convert buffer to base64
            const b64 = Buffer.from(file.buffer).toString('base64');
            const dataURI = `data:${file.mimetype};base64,${b64}`;
            
            // Upload to Cloudinary
            const result = await cloudinary.uploader.upload(dataURI, {
              folder: 'camping_spots',
              resource_type: 'auto'
            });

            // Create image record in database
            return prisma.images.create({
              data: {
                camping_id: spotId,
                image_url: result.secure_url,
                created_at: new Date()
              }
            });
          } catch (error) {
            console.error('Error processing image:', error);
            throw error;
          }
        });

        await Promise.all(uploadPromises);
      }

      // Return the complete updated spot
      return prisma.camping_spot.findUnique({
        where: { camping_spot_id: spotId },
        include: {
          owner: {
            select: {
              owner_id: true,
              license: true
            }
          },
          location: true,
          images: true,
          camping_spot_amenities: {
            include: {
              amenity: true
            }
          }
        }
      });
    });

    // Return the complete updated spot
    res.json(updatedSpot);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating camping spot:', error);
    res.status(500).json({ error: 'Failed to update camping spot' });
  }
});

// Delete a camping spot
router.delete('/:id', async (req, res) => {
  try {
    // Check if user is authenticated (handled by middleware)
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    // Check if camping spot exists and user is the owner
    const existingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(id) }
    });

    if (!existingSpot) {
      throw new NotFoundError('Camping spot not found');
    }

    if (existingSpot.owner_id !== req.user.user_id) {
      throw new ForbiddenError('Not authorized to delete this camping spot');
    }

    // First, delete all related records in the correct order
    await prisma.$transaction(async (prisma) => {
      // 1. Delete all bookings for this camping spot
      await prisma.bookings.deleteMany({
        where: {
          camper_id: parseInt(id)
        }
      });
      // 2. Delete all amenity connections
      await prisma.camping_spot_amenities.deleteMany({
        where: {
          camping_spot_id: parseInt(id)
        }
      });
      // 3. Delete all images
      await prisma.images.deleteMany({
        where: {
          camping_id: parseInt(id)
        }
      });
      // 4. Delete the camping spot
      const deletedSpot = await prisma.camping_spot.delete({
        where: {
          camping_spot_id: parseInt(id)
        },
        include: {
          location: true
        }
      });
      // 5. Finally delete the location if it exists
      if (deletedSpot.location) {
        await prisma.location.delete({
          where: {
            location_id: deletedSpot.location.location_id
          }
        });
      }
    });

    res.status(200).json({ message: 'Camping spot deleted successfully' });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('Error deleting camping spot:', error);
    res.status(500).json({ error: 'Failed to delete camping spot' });
  }
});

router.get('/owner', authenticate, async (req, res) => {
  try {
    console.log('[camping-spots.js] Processing /owner route with auth:', !!req.user);
    console.log('Request headers:', req.headers);
    console.log('User object:', {
      user_id: req.user?.user_id,
      auth_user_id: req.user?.id,
      isowner: req.user?.isowner,
      email: req.user?.email
    });
    
    // Force content type to be JSON for API endpoints
    res.setHeader('Content-Type', 'application/json');
    
    if (!req.user) {
      console.log('No user found in request');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!req.user.user_id) {
      console.log('No user_id found in user object');
      return res.status(400).json({ error: 'Invalid user data' });
    }
    
    // Check if the user is an owner
    const isOwner = req.user.isowner === 1 || 
                    req.user.isowner === '1' || 
                    req.user.isowner === true ||
                    req.user.isowner === 'true';
    
    console.log('Is owner check:', {
      isOwner,
      userIsOwner: req.user.isowner,
      userId: req.user.user_id
    });
    
    if (!isOwner) {
      console.log('User is not an owner:', req.user);
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only owners can access their spots'
      });
    }
    
    const userId = req.user.user_id;
    console.log(`Fetching camping spots for owner ID: ${userId}`);
    
    try {
      // Get all camping spots for this owner
      const spots = await prisma.camping_spot.findMany({
        where: {
          owner_id: userId  // user_id is the same as owner_id
        },
        include: {
          images: {
            take: 1  // Only take the first image for each spot
          },
          location: {
            include: { 
              country: true 
            }
          },
          camping_spot_amenities: {
            include: {
              amenity: true
            }
          },
          bookings: {
            select: {
              start_date: true,
              end_date: true,
              status_id: true
            }
          }
        }
      });
      
      console.log(`Found ${spots.length} camping spots for owner`);
      return res.json(spots);
    } catch (dbError) {
      console.error('Database error:', dbError);
      console.error('Error stack:', dbError.stack);
      return res.status(400).json({ 
        error: 'Database query failed',
        details: dbError.message
      });
    }
  } catch (error) {
    console.error('Owner Spots Error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to fetch owner camping spots',
      details: error.message,
      stack: error.stack
    });
  }
});

// Get availability for a camping spot
router.get('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    const spotId = parseInt(id);
    if (isNaN(spotId)) {
      return res.status(400).json({ error: 'Invalid camping spot ID' });
    }
      // Get all bookings and blocked dates for this spot in the date range
    // Include cancelled bookings (status_id 3) in the response as well
    const bookings = await prisma.bookings.findMany({
      where: {
        camper_id: spotId,
        status_id: {
          in: [1, 2, 3, 5] // Include Pending (1), Confirmed (2), Cancelled (3), and Blocked (5) statuses
        },
        OR: [
          {
            start_date: {
              lte: new Date(endDate)
            },
            end_date: {
              gte: new Date(startDate)
            }
          }
        ]
      },
      orderBy: {
        start_date: 'asc'
      }
    });
    
    res.json({ bookings });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Block dates for a camping spot
router.post('/:id/availability', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }
    
    const spotId = parseInt(id);
    if (isNaN(spotId)) {
      return res.status(400).json({ error: 'Invalid camping spot ID' });
    }
    
    // Check if the user is the owner of this spot
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      select: { owner_id: true, max_guests: true, price_per_night: true }
    });
    
    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }
    
    if (spot.owner_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Not authorized to block dates for this spot' });
    }
    
    // Check if the dates are already blocked or booked
    const existingBookings = await prisma.bookings.findMany({
      where: {
        camper_id: spotId,
        OR: [
          {
            start_date: {
              lte: new Date(endDate)
            },
            end_date: {
              gte: new Date(startDate)
            }
          }
        ]
      }
    });
    
    if (existingBookings.length > 0) {
      return res.status(400).json({ error: 'Some dates in this range are already blocked or booked' });
    }
    
    // Calculate the number of nights
    const start = new Date(startDate);
    const end = new Date(endDate);
    const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    
    // Create a new booking record with status
    const blockedDates = await prisma.bookings.create({
      data: {
        start_date: new Date(startDate),
        end_date: new Date(endDate),
        created_at: new Date(),
        number_of_guests: spot.max_guests,
        cost: 0, // Set cost to 0 for blocked dates
        camping_spot: { connect: { camping_spot_id: spotId } },
        users: { connect: { user_id: req.user.user_id } },
        status_booking_transaction: {
          connect: { status_id: 5 }
        }
      }
    });
    
    res.status(201).json(blockedDates);
  } catch (error) {
    console.error('Error blocking dates:', error);
    res.status(500).json({ error: 'Failed to block dates' });
  }
});

// Unblock dates for a camping spot
router.delete('/:id/availability/:bookingId', authenticate, async (req, res) => {
  try {
    const { id, bookingId } = req.params;
    
    const spotId = parseInt(id);
    const bookingIdNum = parseInt(bookingId);
    
    if (isNaN(spotId) || isNaN(bookingIdNum)) {
      return res.status(400).json({ error: 'Invalid IDs' });
    }
    
    // Check if the user is the owner of this spot
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      select: { owner_id: true }
    });
    
    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }
    
    if (spot.owner_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Not authorized to unblock dates for this spot' });
    }
    
    // Delete the blocked dates booking
    await prisma.bookings.delete({
      where: {
        booking_id: bookingIdNum,
        camper_id: spotId,
        status_id: 5 // Only allow deleting unavailable status bookings
      }
    });
    
    res.status(200).json({ message: 'Dates unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking dates:', error);
    res.status(500).json({ error: 'Failed to unblock dates' });
  }
});

// Get price suggestion for a camping spot
router.get('/:id/price-suggestion', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const spotId = parseInt(id);
    
    if (isNaN(spotId)) {
      return res.status(400).json({ error: 'Invalid camping spot ID' });
    }
    
    // Get the camping spot details
    const spot = await prisma.camping_spot.findUnique({
      where: {
        camping_spot_id: spotId
      },
      include: {
        location: {
          include: {
            country: true
          }
        },
        camping_spot_amenities: {
          include: {
            amenity: true
          }
        }
      }
    });

    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    // Base price calculation
    const basePrice = calculateBasePrice(spot);
    
    // Get current date info
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDay();
    const isWeekend = currentDay === 0 || currentDay === 6;
    const isHoliday = isHolidaySeason(currentMonth);

    // Calculate final price with clear reasoning
    const { suggestedPrice, reason } = calculateSuggestedPrice(spot, basePrice, isWeekend, isHoliday);

    // Prepare response
    res.json({
      suggested_price: suggestedPrice,
      min_suggestion: Math.max(suggestedPrice * 0.8, 30), // Minimum 80% of suggested price or 30 EUR
      max_suggestion: Math.min(suggestedPrice * 1.2, 500), // Maximum 120% of suggested price or 500 EUR
      factors: {
        season: isHoliday ? 'holiday' : isWeekend ? 'weekend' : 'standard',
        amenitiesCount: spot.camping_spot_amenities.length,
        location: spot.location.city
      },
      reason: reason,
      is_cached: false,
      should_update: suggestedPrice !== spot.price_per_night
    });
  } catch (error) {
    console.error('Error calculating price suggestion:', error);
    res.status(500).json({ error: 'Failed to calculate price suggestion' });
  }
});

// Calculate base price based on spot characteristics
function calculateBasePrice(spot) {
  // Start with a base price per guest
  const pricePerGuest = 15; // EUR per guest per night
  const basePrice = pricePerGuest * spot.max_guests;

  // Add premium for amenities (2 EUR per amenity)
  const amenitiesPremium = spot.camping_spot_amenities.length * 2;

  // Add location premium (10-30 EUR based on country)
  const locationPremium = spot.location.country.name.toLowerCase().includes('belgium') ? 20 : 10;

  // Calculate final base price
  return Math.max(
    basePrice + amenitiesPremium + locationPremium,
    40 // Absolute minimum base price
  );
}

// Calculate suggested price with reasoning
function calculateSuggestedPrice(spot, basePrice, isWeekend, isHoliday) {
  let suggestedPrice = basePrice;
  let reason = 'Base price calculated from guest capacity, amenities, and location.';

  // Apply seasonal multiplier
  if (isHoliday) {
    suggestedPrice *= 1.3;
    reason += ' Increased by 30% for holiday season.';
  } else if (isWeekend) {
    suggestedPrice *= 1.2;
    reason += ' Increased by 20% for weekend.';
  }

  // Round to nearest 5 EUR
  suggestedPrice = Math.round(suggestedPrice / 5) * 5;

  // Ensure minimum price of 40 EUR
  suggestedPrice = Math.max(suggestedPrice, 40);

  return {
    suggestedPrice,
    reason
  };
}

// Helper function to determine if current month is holiday season
function isHolidaySeason(month) {
  // Summer months (June, July, August) and December are considered holiday seasons
  return [5, 6, 7, 11].includes(month);
}

// Update price for a camping spot
router.patch('/:id/price', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;
    
    console.log('Updating price for spot:', id, 'New price:', price);
    
    if (!price || isNaN(parseFloat(price))) {
      return res.status(400).json({ error: 'Valid price is required' });
    }
    
    const spotId = parseInt(id);
    if (isNaN(spotId)) {
      return res.status(400).json({ error: 'Invalid camping spot ID' });
    }
    
    // Check if the user is the owner of this spot
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      select: { owner_id: true }
    });
    
    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }
    
    if (spot.owner_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Not authorized to update this spot' });
    }
    
    // Update the price
    const updatedSpot = await prisma.camping_spot.update({
      where: { camping_spot_id: spotId },
      data: {
        price_per_night: parseFloat(price),
        updated_at: new Date()
      }
    });
    
    console.log('Price updated successfully:', updatedSpot);
    res.json(updatedSpot);
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ error: 'Failed to update price' });
  }
});

module.exports = router;