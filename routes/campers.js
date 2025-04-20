const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { geocodeAddress, calculateDistance } = require('../utils/geocoding');
const cloudinary = require('../utils/cloudinary');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fallbackData = require('../utils/fallback-data');

// Helper to handle database connection issues with fallback data
const withDbFallback = async (req, res, dbOperation, fallbackData, errorMessage) => {
  try {
    return await dbOperation();
  } catch (error) {
    // Check if it's a database connection error
    if (error.message && (
      error.message.includes("Can't reach database server") || 
      error.code === 'P1001' || 
      error.name === 'PrismaClientInitializationError')
    ) {
      console.warn('Database connection error. Using fallback data.');
      return fallbackData;
    }
    // For other errors, propagate them
    console.error(errorMessage, error);
    throw error;
  }
};

// Get camping spots with filters
router.get('/', async (req, res) => {
  const { startDate, endDate, lat, lng, radius = 50, ...filters } = req.query;

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
        // Only include spots that aren't booked for the selected dates
        NOT: {
          bookings: {
            some: {
              AND: [
                { start_date: { lte: end } },
                { end_date: { gte: start } },
                { status_id: { in: [2, 4, 5] } }  // Exclude confirmed(2), completed(4), and unavailable(5) for these dates
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

    // Add price filters
    if (filters.minPrice) {
      query.where.price_per_night = { ...query.where.price_per_night, gte: parseFloat(filters.minPrice) };
    }
    if (filters.maxPrice) {
      query.where.price_per_night = { ...query.where.price_per_night, lte: parseFloat(filters.maxPrice) };
    }

    // Add guests filter
    if (filters.guests) {
      query.where.max_guests = { gte: parseInt(filters.guests) };
    }

    // Add amenities filter
    if (filters.amenities) {
      query.where.camping_spot_amenities = {
        some: {
          amenity_id: {
            in: filters.amenities.split(',').map(id => parseInt(id))
          }
        }
      };
    }

    // Try to get spots
    let spots = await prisma.camping_spot.findMany(query);

    // Filter by distance if coordinates provided
    if (lat && lng) {
      const targetLat = parseFloat(lat);
      const targetLng = parseFloat(lng);
      const maxDistance = parseFloat(radius);
      
      console.log('Filtering by distance:', { targetLat, targetLng, maxDistance });

      spots = spots.filter(spot => {
        if (!spot.location?.latitute || !spot.location?.longtitute) return false;
        
        const distance = calculateDistance(
          targetLat,
          targetLng,
          parseFloat(spot.location.latitute),
          parseFloat(spot.location.longtitute)
        );
        return distance <= maxDistance;
      });
    }

    res.json(spots);
  } catch (error) {
    console.error('Search Error:', error);
    // Return a more informative error message
    let statusCode = 500;
    let errorMessage = 'Failed to search camping spots';
    
    if (error.code === 'P1001' || error.message?.includes("Can't reach database")) {
      statusCode = 503;
      errorMessage = 'Database connection issue. Please try again later.';
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      code: error.code || 'UNKNOWN_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Search for available spots 
router.get('/search', async (req, res) => {
  try {
    const { startDate, endDate, location, filters = {} } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    // Build query with all the necessary WHERE conditions
    const query = {
      where: {
        // Only include spots that aren't booked for the selected dates
        NOT: {
          bookings: {
            some: {
              AND: [
                { start_date: { lte: end } },
                { end_date: { gte: start } },
                { status_id: { in: [2, 4, 5] } }  // Exclude confirmed(2), completed(4), and unavailable(5) for these dates
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

    // Add price filters
    if (filters.minPrice) {
      query.where.price_per_night = { ...query.where.price_per_night, gte: parseFloat(filters.minPrice) };
    }
    if (filters.maxPrice) {
      query.where.price_per_night = { ...query.where.price_per_night, lte: parseFloat(filters.maxPrice) };
    }

    // Add guests filter
    if (filters.guests) {
      query.where.max_guests = { gte: parseInt(filters.guests) };
    }

    // Add amenities filter
    if (filters.amenities) {
      query.where.camping_spot_amenities = {
        some: {
          amenity_id: {
            in: filters.amenities.split(',').map(id => parseInt(id))
          }
        }
      };
    }

    let spots = await prisma.camping_spot.findMany(query);

    // Filter by distance if coordinates provided
    if (filters.lat && filters.lng) {
      const targetLat = parseFloat(filters.lat);
      const targetLng = parseFloat(filters.lng);
      const maxDistance = parseFloat(filters.radius || 50);

      spots = spots.filter(spot => {
        if (!spot.location?.latitute || !spot.location?.longtitute) return false;
        
        const distance = calculateDistance(
          targetLat,
          targetLng,
          parseFloat(spot.location.latitute),
          parseFloat(spot.location.longtitute)
        );
        return distance <= maxDistance;
      });
    }

    res.json(spots);
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({ error: 'Failed to search camping spots' });
  }
});

// Get camping spots for specific owner
router.get('/my-spots', async (req, res) => {
  try {
    const spots = await prisma.camping_spot.findMany({
      include: {
        images: true,
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
        bookings: true
      }
    });

    // Calculate some stats for each spot
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    const spotsWithStats = spots.map(spot => {
      // For revenue calculations - include status 2 (confirmed), 3 (cancelled), and 4 (completed) but not unavailable(5)
      const validBookings = spot.bookings.filter(b => [2, 3, 4].includes(b.status_id));
      const totalRevenue = validBookings.reduce((sum, b) => sum + Number(b.cost), 0);
      
      // For occupancy - include confirmed(2), completed(4), and unavailable(5) bookings (exclude cancelled)
      const occupiedBookings = spot.bookings.filter(b => [2, 4, 5].includes(b.status_id));
      
      // Calculate occupied days in current month
      const daysOccupiedThisMonth = occupiedBookings.reduce((sum, b) => {
        // Convert to date objects to ensure proper date handling
        const start = new Date(Math.max(new Date(b.start_date), firstDayOfMonth));
        const end = new Date(Math.min(new Date(b.end_date), lastDayOfMonth));
        
        // Only count if the end date is after start date
        if (end > start) {
          const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          return sum + daysDiff;
        }
        return sum;
      }, 0);
      
      // For bookings count - only include confirmed(2) and completed(4) bookings
      const activeBookings = spot.bookings.filter(b => [2, 4].includes(b.status_id));
      
      const stats = {
        totalBookings: activeBookings.length, // Exclude cancelled and unavailable
        revenue: totalRevenue, 
        cancelledRevenue: validBookings.filter(b => b.status_id === 3).reduce((sum, b) => sum + Number(b.cost), 0),
        activeBookings: spot.bookings.filter(b => {
          const end = new Date(b.end_date);
          return end >= today && [2].includes(b.status_id); // Only count confirmed(2) for active
        }).length,
        occupancyRate: Math.min(100, Math.round((daysOccupiedThisMonth / daysInMonth) * 100))
      };

      return {
        ...spot,
        stats
      };
    });

    res.json(spotsWithStats);
  } catch (error) {
    console.error('My Spots Error:', error);
    res.status(500).json({ error: 'Failed to fetch your camping spots' });
  }
});

// Get camping spots for specific owner
router.get('/owner', async (req, res) => {
  try {
    // Get user ID from authenticated user
    const userId = req.supabaseUser?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log('Looking up user with auth_user_id:', userId);

    // Use the prisma instance from this module (not from auth middleware)
    const user = await prisma.public_users.findFirst({
      where: {
        auth_user_id: userId
      }
    });

    if (!user) {
      console.log('User not found for auth_user_id:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Found user:', user.user_id);

    // Use the prisma instance from this module
    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: user.user_id
      },
      include: {
        images: true,
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

    console.log('Found spots count:', spots.length);
    res.json(spots);
  } catch (error) {
    console.error('Owner Spots Error:', error);
    res.status(500).json({ error: 'Failed to fetch owner camping spots' });
  }
});

// Helper function to calculate occupancy rate - update to include unavailable
function calculateOccupancyRate(bookings) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const daysInYear = 365;
  
  // Include both confirmed/completed and unavailable bookings for occupancy calculation
  const occupiedBookings = bookings.filter(b => [2, 4, 5].includes(b.status_id));
  
  const bookedDays = occupiedBookings.reduce((total, booking) => {
    // Ensure dates are valid Date objects
    const start = new Date(booking.start_date);
    const end = new Date(booking.end_date);
    
    if (start.getFullYear() === thisYear && end > start) {
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      return total + days;
    }
    return total;
  }, 0);

  return Math.min(100, Math.round((bookedDays / daysInYear) * 100));
}

// Get all amenities
router.get('/amenities', async (req, res) => {
  try {
    // Use withDbFallback to handle database connection issues
    const amenities = await withDbFallback(
      req,
      res,
      () => prisma.amenity.findMany({
        orderBy: { name: 'asc' }
      }),
      fallbackData.amenities,
      'Amenities Error:'
    );
    
    res.json(amenities);
  } catch (error) {
    console.error('Amenities Error:', error);
    res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

// Get all countries
router.get('/countries', async (req, res) => {
  try {
    const countries = await prisma.country.findMany({
      orderBy: {
        name: 'asc'
      }
    });
    res.json(countries);
  } catch (error) {
    console.error('Countries Error:', error);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

// Create new camping spot
router.post('/', upload.array('images', 10), async (req, res) => {
  console.log('Received POST request for new camping spot');
  console.log('Request body:', req.body);
  console.log('Files received:', req.files ? req.files.length : 0);

  try {
    const {
      title,
      description,
      price_per_night,
      max_guests,
      owner_id,
      location: locationStr,
      amenities: amenitiesStr
    } = req.body;

    // Validate required fields
    if (!title || !description || !price_per_night || !max_guests || !owner_id) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Title, description, price, max guests, and owner ID are required'
      });
    }

    // Explicitly validate owner_id to prevent NaN
    if (!owner_id) {
      return res.status(400).json({ error: 'owner_id is required' });
    }

    const parsedOwnerId = parseInt(owner_id);
    if (isNaN(parsedOwnerId)) {
      return res.status(400).json({ 
        error: 'Invalid owner_id format', 
        details: `Received owner_id: ${owner_id}` 
      });
    }
    
    // Parse JSON strings safely
    let locationData, amenities;
    
    try {
      locationData = typeof locationStr === 'string' ? JSON.parse(locationStr) : locationStr;
      amenities = typeof amenitiesStr === 'string' ? JSON.parse(amenitiesStr) : amenitiesStr;
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return res.status(400).json({ 
        error: 'Invalid data format', 
        details: 'Could not parse location or amenities data'
      });
    }
    
    // Validate location data
    if (!locationData || !locationData.address_line1 || !locationData.city || !locationData.country_id || !locationData.postal_code) {
      return res.status(400).json({ 
        error: 'Invalid location data',
        details: 'Address, city, country, and postal code are required'
      });
    }
    
    if (!Array.isArray(amenities)) {
      amenities = []; // Default to empty array if not provided or invalid
    }

    // Get coordinates for the address using geocoding service
    let coordinates = { latitude: 0, longitude: 0 };
    try {
      coordinates = await geocodeAddress(locationData);
      console.log('Geocoded coordinates:', coordinates);
    } catch (geocodeError) {
      console.error('Geocoding error:', geocodeError);
      // Continue with default coordinates if geocoding fails
      console.log('Using default coordinates due to geocoding failure');
    }

    // Upload images to Cloudinary
    const imageUploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'camping_spots' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url + '#' + result.public_id);
          }
        );
        uploadStream.end(file.buffer);
      });
    });

    const imageUrls = await Promise.all(imageUploadPromises);

    // Create camping spot with all related data in a transaction
    const newSpot = await prisma.$transaction(async (tx) => {
      // First, create or connect to the location
      const newLocation = await tx.location.create({
        data: {
          address_line1: locationData.address_line1,
          address_line2: locationData.address_line2 || '',
          city: locationData.city,
          country_id: parseInt(locationData.country_id),
          postal_code: locationData.postal_code,
          longtitute: String(coordinates.longitude || 0),
          latitute: String(coordinates.latitude || 0)
        }
      });

      // Then create the camping spot with the location connected
      return await tx.camping_spot.create({
        data: {
          title,
          description,
          max_guests: parseInt(max_guests),
          price_per_night: parseFloat(price_per_night),
          owner: {
            connect: { owner_id: parseInt(owner_id) }
          },
          location: {
            connect: { location_id: newLocation.location_id }
          },
          camping_spot_amenities: {
            create: amenities.map(amenityId => ({
              amenity: {
                connect: { amenity_id: parseInt(amenityId) }
              }
            }))
          },
          images: {
            create: imageUrls.map(url => ({
              image_url: url,
              created_at: new Date()
            }))
          },
          created_at: new Date(),
          updated_at: new Date()
        },
        include: {
          camping_spot_amenities: {
            include: {
              amenity: true
            }
          },
          images: true,
          location: true
        }
      });
    });

    res.status(201).json(newSpot);
  } catch (error) {
    console.error('Create Error:', error);
    res.status(500).json({ error: 'Failed to create camping spot', details: error.message });
  }
});

// Update camping spot
router.put('/:id', upload.array('images', 10), async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Update request for spot:', id);
    console.log('Request body:', req.body);
    
    const {
      title,
      description,
      max_guests,
      price_per_night,
      location: locationStr,
      amenities: amenitiesStr,
      existing_images: existingImagesStr
    } = req.body;

    // Log the description for debugging
    console.log('Received description:', description);

    // Validate field lengths
    if (title && title.length > 100) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: 'Title must be less than 100 characters' 
      });
    }

    if (description && description.length > 2000) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: 'Description must be less than 2000 characters' 
      });
    }

    // Parse and validate JSON data
    let locationData, amenities, existingImages;
    try {
      locationData = typeof locationStr === 'string' ? JSON.parse(locationStr) : locationStr;
      amenities = typeof amenitiesStr === 'string' ? JSON.parse(amenitiesStr) : amenitiesStr;
      existingImages = JSON.parse(existingImagesStr || '[]');
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return res.status(400).json({ 
        error: 'Invalid data format', 
        details: 'Could not parse location or amenities data'
      });
    }

    // Validate and trim location data
    if (locationData) {
      // Trim all string fields
      if (locationData.address_line1) locationData.address_line1 = locationData.address_line1.trim().substring(0, 255);
      if (locationData.address_line2) locationData.address_line2 = locationData.address_line2.trim().substring(0, 255);
      if (locationData.city) locationData.city = locationData.city.trim().substring(0, 100);
      if (locationData.postal_code) locationData.postal_code = locationData.postal_code.trim().substring(0, 20);
    }

    // Get coordinates for the address using geocoding service
    let coordinates = { latitude: 0, longitude: 0 };
    try {
      coordinates = await geocodeAddress(locationData);
      console.log('Geocoded coordinates:', coordinates);
    } catch (geocodeError) {
      console.error('Geocoding error:', geocodeError);
      // Continue with default coordinates if geocoding fails
    }

    // Ensure coordinates are properly formatted with limited precision
    const formattedLongitude = typeof coordinates.longitude === 'number' ? 
      coordinates.longitude.toFixed(6) : '0';
    const formattedLatitude = typeof coordinates.latitude === 'number' ? 
      coordinates.latitude.toFixed(6) : '0';

    // Upload new images to Cloudinary
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'camping_spots' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(file.buffer);
          });
          
          uploadedImages.push({
            image_url: `${result.secure_url}#${result.public_id}`,
            created_at: new Date()
          });
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          throw new Error('Failed to upload image to Cloudinary');
        }
      }
    }

    // Clean up and validate text fields 
    const cleanTitle = title ? title.trim().substring(0, 100) : '';
    const cleanDescription = description ? description.trim().substring(0, 1000) : ''; // Reduce max length to 255 characters
    
    // Log the cleaned description
    console.log('Clean description prepared for update:', cleanDescription);
    console.log('Description length:', cleanDescription.length);
    
    // Validate numeric fields
    const parsedMaxGuests = parseInt(max_guests);
    if (isNaN(parsedMaxGuests) || parsedMaxGuests < 1) {
      return res.status(400).json({ error: 'Invalid max guests value' });
    }
    
    const parsedPrice = parseFloat(price_per_night);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: 'Invalid price value' });
    }

    // Get existing camping spot to retain values that aren't being updated
    const existingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(id) }
    });

    if (!existingSpot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update location
      if (locationData.location_id) {
        await tx.location.update({
          where: { location_id: parseInt(locationData.location_id) },
          data: {
            address_line1: locationData.address_line1,
            address_line2: locationData.address_line2 || '',
            city: locationData.city,
            country_id: parseInt(locationData.country_id),
            postal_code: locationData.postal_code,
            longtitute: formattedLongitude,
            latitute: formattedLatitude
          }
        });
      }

      // Update amenities
      await tx.camping_spot_amenities.deleteMany({
        where: { camping_spot_id: parseInt(id) }
      });

      if (amenities?.length > 0) {
        await tx.camping_spot_amenities.createMany({
          data: amenities.map(amenityId => ({
            camping_spot_id: parseInt(id),
            amenity_id: parseInt(amenityId)
          }))
        });
      }

      // Handle images
      if (existingImages.length === 0) {
        // If no existing images are specified, delete all current images
        await tx.images.deleteMany({
          where: { camping_id: parseInt(id) }
        });
      } else {
        // Otherwise, only delete images that are not in the existingImages array
        await tx.images.deleteMany({
          where: {
            camping_id: parseInt(id),
            NOT: {
              image_id: { in: existingImages.map(id => parseInt(id)) }
            }
          }
        });
      }

      // Add new uploaded images
      if (uploadedImages.length > 0) {
        await tx.images.createMany({
          data: uploadedImages.map(img => ({
            camping_id: parseInt(id),
            image_url: img.image_url,
            created_at: img.created_at
          }))
        });
      }

      // Prepare update data with proper handling of potentially missing fields
      const updateData = {
        updated_at: new Date()
      };

      // Only include fields in the update if they were provided
      if (title !== undefined) updateData.title = cleanTitle;
      if (description !== undefined) updateData.description = cleanDescription;
      if (max_guests !== undefined) updateData.max_guests = parsedMaxGuests;
      if (price_per_night !== undefined) updateData.price_per_night = parsedPrice;

      console.log('Updating camping spot with data:', updateData);

      // Update camping spot with clean values
      return await tx.camping_spot.update({
        where: { camping_spot_id: parseInt(id) },
        data: updateData,
        include: {
          camping_spot_amenities: {
            include: { amenity: true }
          },
          images: true,
          location: {
            include: {
              country: true
            }
          }
        }
      });
    });

    res.json(result);
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ 
      error: 'Failed to update camping spot',
      details: error.message,
      stack: error.stack 
    });
  }
});

// Update camping spot price endpoint
router.patch('/:id/price', async (req, res) => {
  try {
    const { id } = req.params;
    let { price_per_night } = req.body;
    
    // Added more logging for debugging
    console.log('Price update request received:', { id, price_per_night, body: req.body });
    
    // Check if we received price through price_per_night or price field
    if (price_per_night === undefined && req.body.price !== undefined) {
      price_per_night = req.body.price;
    }
    
    if (price_per_night === undefined || isNaN(parseFloat(price_per_night))) {
      console.error('Invalid price received:', price_per_night);
      return res.status(400).json({ error: 'Valid price is required' });
    }

    // Parse the price to a float with 2 decimal places
    const formattedPrice = parseFloat(parseFloat(price_per_night).toFixed(2));
    
    // Enforce a minimum price
    if (formattedPrice < 5) {
      return res.status(400).json({ error: 'Price cannot be less than €5' });
    }

    // Enforce a maximum price for sanity
    if (formattedPrice > 1000) {
      return res.status(400).json({ error: 'Price cannot exceed €1000' });
    }
    
    console.log(`Updating price for spot ${id} to ${formattedPrice}`);
    
    // Update the spot with new price
    const updatedSpot = await prisma.camping_spot.update({
      where: { camping_spot_id: parseInt(id) },
      data: {
        price_per_night: formattedPrice,
        updated_at: new Date()
      },
      select: {
        camping_spot_id: true,
        title: true,
        price_per_night: true,
        updated_at: true
      }
    });
    
    console.log('Price updated successfully:', updatedSpot);
    res.json(updatedSpot);
  } catch (error) {
    console.error('Price Update Error:', error);
    res.status(500).json({ 
      error: 'Failed to update camping spot price',
      details: error.message,
      stack: error.stack 
    });
  }
});

// Delete camping spot
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.$transaction(async (tx) => {
      // Delete related records first
      await tx.camping_spot_amenities.deleteMany({
        where: { camping_spot_id: parseInt(id) }
      });

      await tx.images.deleteMany({
        where: { camping_id: parseInt(id) }
      });

      await tx.bookings.deleteMany({
        where: { camping_spot_id: parseInt(id) }
      });

      // Delete the camping spot
      await tx.camping_spot.delete({
        where: { camping_spot_id: parseInt(id) }
      });
    });

    res.json({ message: 'Camping spot deleted successfully' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: 'Failed to delete camping spot' });
  }
});

// Delete specific image
router.delete('/images/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const image = await prisma.images.findUnique({
      where: { image_id: parseInt(id) }
    });

    if (image) {
      // Extract public_id from the image URL
      const publicId = image.image_url.split('#').pop();
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (cloudinaryError) {
          console.error('Cloudinary delete error:', cloudinaryError);
        }
      }

      await prisma.images.delete({
        where: { image_id: parseInt(id) }
      });
    }

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete Image Error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Get single camping spot by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  try {
    // Validate dates if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      
      // Check for bookings or unavailable dates that would block this reservation period
      try {
        // Only check status 2 (confirmed), 4 (completed), and 5 (unavailable)
        // Explicitly exclude status 3 (cancelled)
        const existingBookings = await prisma.bookings.findMany({
          where: {
            camper_id: parseInt(id),
            status_id: {
              in: [2, 4, 5]  // Include confirmed (2), completed (4), and unavailable (5)
            },
            OR: [
              { AND: [
                { start_date: { lte: end } },
                { end_date: { gte: start } }
              ]}
            ]
          }
        });

        if (existingBookings.length > 0) {
          // For API clients that need to know if dates are available
          res.setHeader('X-Dates-Available', 'false');
        } else {
          res.setHeader('X-Dates-Available', 'true');
        }
      } catch (bookingError) {
        console.error('Error checking bookings:', bookingError);
        // Continue with spot fetch even if booking check fails
      }
    }

    // Find the camping spot without owner details
    try {
      // Add timeout to Prisma query
      const spot = await Promise.race([
        prisma.camping_spot.findUnique({
          where: {
            camping_spot_id: parseInt(id)
          },
          include: {
            images: true,
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
              include: {
                review: true
              }
            }
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 5000)
        )
      ]);

      if (!spot) {
        return res.status(404).json({ error: 'Camping spot not found' });
      }

      // Add reviews data from bookings
      spot.reviews = spot.bookings
        .filter(booking => booking.review)
        .map(booking => booking.review);

      // Remove bookings from response if not needed
      delete spot.bookings;

      res.json(spot);
    } catch (spotError) {
      if (spotError.code === 'P1001') {
        return res.status(503).json({ 
          error: 'Database connection error', 
          message: 'Unable to connect to the database. Please try again later.',
          code: 'DB_CONNECTION_ERROR'
        });
      }
      throw spotError;
    }
  } catch (error) {
    console.error('Get Single Spot Error:', error);
    const statusCode = error.code === 'P1001' ? 503 : 500;
    res.status(statusCode).json({ 
      error: error.code === 'P1001' ? 'Database connection error' : 'Failed to fetch camping spot', 
      details: error.message,
      code: error.code
    });
  }
});

// Improve the availability endpoint
router.get('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    try {
      // Validate the camping spot exists with a timeout
      const spotExists = await Promise.race([
        prisma.camping_spot.findUnique({
          where: { camping_spot_id: parseInt(id) }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 5000)
        )
      ]);
      
      if (!spotExists) {
        return res.status(404).json({ error: 'Camping spot not found' });
      }
      
      // Find ALL bookings in this date range - important to get everything
      const bookings = await Promise.race([
        prisma.bookings.findMany({
          where: {
            camper_id: parseInt(id),
            status_id: {
              in: [2, 4, 5]  // Confirmed, completed, or unavailable
            },
            OR: [
              // Full or partial overlap with the requested date range
              { AND: [
                { start_date: { lte: end } },
                { end_date: { gte: start } }
              ]}
            ]
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 5000)
        )
      ]);
      
      console.log(`Found ${bookings.length} bookings for spot ${id} in date range ${startDate} to ${endDate}`);
      
      // Include ALL matched bookings, not just checking if there are any
      res.json({
        hasBlockedDates: bookings.length > 0,
        availableDates: bookings.length === 0,
        bookings: bookings
      });
    } catch (dbError) {
      console.error('Database error checking availability:', dbError);
      
      // Handle specific database connection errors
      if (dbError.code === 'P1001' || dbError.message?.includes("Can't reach database")) {
        return res.status(503).json({
          error: 'Database connection error',
          message: 'Cannot connect to database server. Please try again later.',
          code: 'P1001'
        });
      }
      
      throw dbError;
    }
  } catch (error) {
    console.error('Availability check error:', error);
    res.status(500).json({ 
      error: 'Failed to check availability',
      message: error.message
    });
  }
});

// Add availability block for a camping spot
router.post('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, owner_id } = req.body;

    console.log('Blocking availability request:', { id, startDate, endDate, owner_id });

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    
    // Set to beginning of today, removing time component
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.error('Invalid date format:', { startDate, endDate });
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (start < today) {
      console.error('Cannot block dates in the past:', { start, today });
      return res.status(400).json({ error: 'Cannot block dates in the past' });
    }

    if (end <= start) {
      console.error('End date must be after start date:', { start, end });
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // Check for existing bookings in this date range that aren't cancelled or unavailable
    const existingBookings = await prisma.bookings.findMany({
      where: {
        camper_id: parseInt(id),
        status_id: {
          in: [1, 2, 4] // Pending, Confirmed, Completed - exclude Cancelled(3) and Unavailable(5)
        },
        OR: [
          // Booking starts within the range
          {
            start_date: {
              gte: start,
              lte: end
            }
          },
          // Booking ends within the range
          {
            end_date: {
              gte: start,
              lte: end
            }
          },
          // Booking spans the entire range
          {
            AND: [
              { start_date: { lte: start } },
              { end_date: { gte: end } }
            ]
          }
        ]
      }
    });

    if (existingBookings.length > 0) {
      console.log('Cannot block dates due to existing bookings:', existingBookings.length);
      return res.status(400).json({ 
        error: 'Cannot block availability due to existing bookings in this date range' 
      });
    }

    // Create unavailability booking
    const unavailableBooking = await prisma.bookings.create({
      data: {
        camper_id: parseInt(id),
        user_id: parseInt(owner_id), // The spot owner is setting the unavailability
        start_date: start,
        end_date: end,
        number_of_guests: 0, // No guests for unavailability
        cost: 0, // No cost for unavailability
        created_at: new Date(),
        status_id: 5 // UNAVAILABLE status
      }
    });

    console.log('Successfully blocked dates:', { bookingId: unavailableBooking.booking_id });
    res.status(201).json({ 
      message: 'Dates marked as unavailable successfully',
      booking: unavailableBooking
    });
  } catch (error) {
    console.error('Availability Block Error:', error);
    res.status(500).json({ error: 'Failed to block availability' });
  }
});

// Remove availability block for a camping spot
router.delete('/:id/availability/:bookingId', async (req, res) => {
  try {
    const { id, bookingId } = req.params;

    // Validate the booking exists and is associated with this camping spot
    const booking = await prisma.bookings.findFirst({
      where: {
        booking_id: parseInt(bookingId),
        camper_id: parseInt(id),
        status_id: 5 // UNAVAILABLE status
      }
    });

    if (!booking) {
      return res.status(404).json({ 
        error: 'Availability block not found or not associated with this camping spot'
      });
    }

    // Delete the unavailability booking
    await prisma.bookings.delete({
      where: { booking_id: parseInt(bookingId) }
    });

    res.json({ message: 'Availability block removed successfully' });
  } catch (error) {
    console.error('Delete Availability Block Error:', error);
    res.status(500).json({ error: 'Failed to remove availability block' });
  }
});

// Find the price suggestion endpoint and replace it with this improved version
router.get('/:id/price-suggestion', async (req, res) => {
  try {
    const { id } = req.params;
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(id) },
      include: {
        location: {
          include: {
            country: true
          }
        },
        bookings: true,
        camping_spot_amenities: true
      }
    });
    
    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    // Check if price was updated in the last 24 hours - if so, don't provide a new suggestion
    const lastUpdateTime = new Date(spot.updated_at || spot.created_at);
    const timeSinceUpdate = Date.now() - lastUpdateTime.getTime();
    const hoursSinceUpdate = timeSinceUpdate / (1000 * 60 * 60);

    // If updated in the last 24 hours, return current price as suggestion with a note
    if (hoursSinceUpdate < 24) {
      return res.json({
        suggested_price: spot.price_per_night,
        min_suggestion: spot.price_per_night * 0.95, 
        max_suggestion: spot.price_per_night * 1.05,
        reason: "Price was recently updated. New suggestions will be available later.",
        market_details: {
          similar_spots_avg_price: null,
          demand_factor: 1,
          seasonality_factor: 1,
          amenities_factor: 1,
          occupancy_rate: 0, // We're not calculating this currently
          similar_spots: 0,
          market_average: null,
          season: "standard",
          demand: "normal",
          last_updated: lastUpdateTime.toISOString(),
          hours_since_update: Math.round(hoursSinceUpdate)
        },
        should_update: false
      });
    }

    // Get the current date for seasonal pricing
    const currentDate = new Date();
    const month = currentDate.getMonth(); // 0-11
    const dayOfWeek = currentDate.getDay(); // 0-6

    // Calculate seasonal multiplier (higher in summer months)
    let seasonalityFactor = 1.0;
    let season = "standard";

    // Summer (Jun-Aug): Higher prices
    if (month >= 5 && month <= 7) {
      seasonalityFactor = 1.15 + (Math.random() * 0.1); // 1.15-1.25
      season = "peak";
    }
    // Spring (Mar-May) and Fall (Sept-Oct): Medium-high prices
    else if ((month >= 2 && month <= 4) || (month >= 8 && month <= 9)) {
      seasonalityFactor = 1.05 + (Math.random() * 0.05); // 1.05-1.10
      season = "high";
    }
    // Winter (Nov-Feb): Lower prices except holiday season
    else if ((month === 11 && currentDate.getDate() > 15) || month === 0) {
      // Holiday season (Dec 15-Jan)
      seasonalityFactor = 1.1 + (Math.random() * 0.1); // 1.1-1.2
      season = "holiday";
    }
    else {
      seasonalityFactor = 0.85 + (Math.random() * 0.1); // 0.85-0.95
      season = "off-peak";
    }

    // Weekend premium (Fri-Sat)
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      seasonalityFactor *= 1.1;
    }

    // Get similar spots in the same country or city for comparison
    const similarSpots = await prisma.camping_spot.findMany({
      where: {
        camping_spot_id: { not: parseInt(id) },
        location: {
          country_id: spot.location.country_id
        },
      },
      include: {
        bookings: true,
      }
    });

    // Filter to find more relevant similar spots
    const relevantSpots = similarSpots.filter(s => 
      Math.abs(s.max_guests - spot.max_guests) <= 2
    );

    // Calculate demand factor based on recent bookings and cancellations
    const recentBookings = spot.bookings.filter(b => {
      const bookingDate = new Date(b.created_at);
      const daysSinceBooking = (Date.now() - bookingDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceBooking <= 30; // Bookings within last 30 days
    });

    const confirmedBookings = recentBookings.filter(b => b.status_id === 2).length;
    const completedBookings = recentBookings.filter(b => b.status_id === 4).length;
    const cancelledBookings = recentBookings.filter(b => b.status_id === 3).length;

    // Demand factor calculation
    let demandFactor = 1.0;
    let demandCategory = "normal";

    if (recentBookings.length > 0) {
      // Calculate ratio of successful vs cancelled bookings
      const successRate = (confirmedBookings + completedBookings) / 
                          Math.max(1, (confirmedBookings + completedBookings + cancelledBookings));

      if (successRate > 0.8 && (confirmedBookings + completedBookings) >= 3) {
        // High demand - more bookings and high success rate
        demandFactor = 1.05 + (Math.random() * 0.15); // 1.05-1.20
        demandCategory = "high";
      } else if (successRate < 0.5 || cancelledBookings > confirmedBookings) {
        // Low demand - high cancellation rate
        demandFactor = 0.9 - (Math.random() * 0.1); // 0.8-0.9
        demandCategory = "low";
      } else {
        // Normal demand
        demandFactor = 0.95 + (Math.random() * 0.1); // 0.95-1.05
        demandCategory = "normal";
      }
    }

    // Amenities factor - more amenities justify higher price
    const amenitiesCount = spot.camping_spot_amenities.length;
    const amenitiesFactor = 1 + (Math.min(amenitiesCount, 10) * 0.01);

    // Calculate market average if we have relevant spots
    let marketAverage = null;
    if (relevantSpots.length > 0) {
      const totalPrice = relevantSpots.reduce((sum, s) => sum + s.price_per_night, 0);
      marketAverage = Math.round(totalPrice / relevantSpots.length);
    }

    // Base price calculation - weighted between current price and market average
    let basePrice = spot.price_per_night;
    if (marketAverage) {
      // Market weight increases if the price hasn't been updated in a while
      const marketWeight = Math.min(0.6, 0.3 + (hoursSinceUpdate / 24 * 0.01));
      basePrice = (spot.price_per_night * (1 - marketWeight)) + (marketAverage * marketWeight);
    }

    // Randomness factor to avoid always suggesting the same price
    // Will suggest decrease about 40% of the time
    const randomFactor = 0.95 + (Math.random() * 0.1); // 0.95-1.05

    // Calculate suggested price
    let suggestedPrice = Math.round(basePrice * seasonalityFactor * demandFactor * amenitiesFactor * randomFactor);

    // Ensure price doesn't change too dramatically (max ±15%)
    const maxChange = 0.15;
    const minPrice = Math.round(spot.price_per_night * (1 - maxChange));
    const maxPrice = Math.round(spot.price_per_night * (1 + maxChange));
    suggestedPrice = Math.min(Math.max(suggestedPrice, minPrice), maxPrice);

    // Determine whether price should be updated based on the difference
    const priceDifference = Math.abs(suggestedPrice - spot.price_per_night);
    const percentChange = priceDifference / spot.price_per_night;
    const shouldUpdate = percentChange >= 0.05; // Only suggest update if 5% or greater difference

    // Determine primary reason for the suggestion
    let reason = "";
    if (suggestedPrice > spot.price_per_night) {
      if (season === "peak" || season === "holiday") {
        reason = `Seasonal demand is high (${season} season).`;
      } else if (demandCategory === "high") {
        reason = "Your spot has high booking demand.";
      } else if (marketAverage && marketAverage > spot.price_per_night) {
        reason = "Similar spots in your area are charging more.";
      } else {
        reason = "Based on overall market analysis.";
      }
    } else if (suggestedPrice < spot.price_per_night) {
      if (season === "off-peak") {
        reason = "Currently in off-peak season.";
      } else if (demandCategory === "low") {
        reason = "Bookings have slowed down recently.";
      } else if (marketAverage && marketAverage < spot.price_per_night) {
        reason = "Similar spots in your area are charging less.";
      } else {
        reason = "More competitive pricing may increase bookings.";
      }
    } else {
      reason = "Your current price is optimal.";
    }

    // Get min and max for the suggestion range (±5%)
    const minSuggestion = Math.round(suggestedPrice * 0.95);
    const maxSuggestion = Math.round(suggestedPrice * 1.05);

    res.json({
      suggested_price: suggestedPrice,
      min_suggestion: minSuggestion,
      max_suggestion: maxSuggestion,
      reason: reason,
      market_details: {
        similar_spots_avg_price: marketAverage,
        demand_factor: parseFloat(demandFactor.toFixed(2)),
        seasonality_factor: parseFloat(seasonalityFactor.toFixed(2)),
        amenities_factor: parseFloat(amenitiesFactor.toFixed(2)),
        occupancy_rate: 0, // We're not calculating this currently
        similar_spots: relevantSpots.length,
        market_average: marketAverage,
        season: season,
        demand: demandCategory,
        last_updated: lastUpdateTime.toISOString(),
        hours_since_update: Math.round(hoursSinceUpdate)
      },
      should_update: shouldUpdate
    });
  } catch (error) {
    console.error('Price Suggestion Error:', error);
    res.status(500).json({ error: 'Failed to generate price suggestion' });
  }
});

module.exports = router;