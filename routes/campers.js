const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { geocodeAddress, calculateDistance } = require('../utils/geocoding');
const cloudinary = require('../utils/cloudinary');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { authenticate } = require('../middlewares/auth');

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
    
    let query = {
      where: {
        NOT: {
          bookings: {
            some: {
              AND: [
                { start_date: { lte: end } },
                { end_date: { gte: start } },
                { status_id: { in: [2, 4, 5] } }  // Exclude confirmed, completed, and unavailable for these dates
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
    if (lat && lng) {
      const targetLat = parseFloat(lat);
      const targetLng = parseFloat(lng);
      const maxDistance = parseFloat(radius);

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
      // Include status 2 (confirmed), 3 (cancelled), and 4 (completed) for revenue calculations
      const validBookings = spot.bookings.filter(b => [2, 3, 4].includes(b.status_id));
      const totalRevenue = validBookings.reduce((sum, b) => sum + Number(b.cost), 0);
      
      // For occupancy, only count non-cancelled bookings
      const activeBookings = validBookings.filter(b => [2, 4].includes(b.status_id));
      
      // Calculate occupied days in current month
      const daysOccupiedThisMonth = activeBookings.reduce((sum, b) => {
        const start = new Date(Math.max(b.start_date, firstDayOfMonth));
        const end = new Date(Math.min(b.end_date, lastDayOfMonth));
        if (end > start) {
          return sum + Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        }
        return sum;
      }, 0);
      
      const stats = {
        totalBookings: activeBookings.length,
        revenue: totalRevenue, // Include revenue from cancelled bookings
        cancelledRevenue: validBookings.filter(b => b.status_id === 3).reduce((sum, b) => sum + Number(b.cost), 0),
        occupancyRate: Math.round((daysOccupiedThisMonth / daysInMonth) * 100)
      };

      return {
        ...spot,
        stats
      };
    });

    res.json(spotsWithStats);
  } catch (error) {
    console.error('Owner Spots Error:', error);
    res.status(500).json({ error: 'Failed to fetch owner camping spots' });
  }
});

// Get camping spots for specific owner
router.get('/owner', authenticate, async (req, res) => {
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

// Helper function to calculate occupancy rate
function calculateOccupancyRate(bookings) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const daysInYear = 365;
  
  const bookedDays = bookings.reduce((total, booking) => {
    const start = new Date(booking.start_date);
    const end = new Date(booking.end_date);
    if (start.getFullYear() === thisYear) {
      const days = (end - start) / (1000 * 60 * 60 * 24);
      return total + days;
    }
    return total;
  }, 0);

  return Math.round((bookedDays / daysInYear) * 100);
}

// Get all amenities
router.get('/amenities', async (req, res) => {
  try {
    const amenities = await prisma.amenity.findMany({
      orderBy: {
        name: 'asc'
      }
    });
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
  console.log('Received request body:', req.body);
  console.log('Received files:', req.files);

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

    const location = typeof locationStr === 'string' ? JSON.parse(locationStr) : locationStr;
    const amenities = typeof amenitiesStr === 'string' ? JSON.parse(amenitiesStr) : amenitiesStr;

    // Upload images to Cloudinary first
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const base64String = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
          const result = await cloudinary.uploader.upload(base64String, {
            folder: 'camping_spots',
            resource_type: 'auto'
          });
          // Store URL with public_id appended as a query parameter
          uploadedImages.push({
            image_url: `${result.secure_url}#${result.public_id}`
          });
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          throw new Error('Failed to upload image to Cloudinary');
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create location first
      const newLocation = await tx.location.create({
        data: {
          address_line1: location.address_line1,
          address_line2: location.address_line2 || '',
          city: location.city,
          country_id: parseInt(location.country_id),
          postal_code: location.postal_code,
          longtitute: '0', // You might want to add proper coordinates
          latitute: '0'
        }
      });

      // Create camping spot with location and images
      const newSpot = await tx.camping_spot.create({
        data: {
          title,
          description,
          max_guests: parseInt(max_guests),
          price_per_night: parseFloat(price_per_night),
          owner_id: parseInt(owner_id),
          location_id: newLocation.location_id,
          created_at: new Date(),
          updated_at: new Date(),
          camping_spot_amenities: {
            create: amenities.map(amenity_id => ({
              amenity: {
                connect: { amenity_id: parseInt(amenity_id) }
              }
            }))
          },
          images: {
            create: uploadedImages.map(img => ({
              image_url: img.image_url,
              created_at: new Date()
            }))
          }
        },
        include: {
          camping_spot_amenities: {
            include: { amenity: true }
          },
          images: true,
          location: true
        }
      });

      return newSpot;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create Error:', error);
    res.status(500).json({ 
      error: 'Failed to create camping spot',
      details: error.message 
    });
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

    const location = JSON.parse(locationStr);
    const amenities = JSON.parse(amenitiesStr);
    const existingImages = JSON.parse(existingImagesStr || '[]');

    // Upload new images to Cloudinary
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const base64String = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
          const result = await cloudinary.uploader.upload(base64String, {
            folder: 'camping_spots',
            resource_type: 'auto'
          });
          uploadedImages.push({
            image_url: result.secure_url,
            created_at: new Date()
          });
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          throw new Error('Failed to upload image to Cloudinary');
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update location
      if (location.location_id) {
        await tx.location.update({
          where: { location_id: parseInt(location.location_id) },
          data: {
            address_line1: location.address_line1,
            address_line2: location.address_line2 || '',
            city: location.city,
            country_id: parseInt(location.country_id),
            postal_code: location.postal_code
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
        // Delete only images that aren't in existingImages
        await tx.images.deleteMany({
          where: {
            AND: [
              { camping_id: parseInt(id) },
              { image_id: { notIn: existingImages.map(imgId => parseInt(imgId)) } }
            ]
          }
        });
      }

      // Add new images
      if (uploadedImages.length > 0) {
        await tx.images.createMany({
          data: uploadedImages.map(img => ({
            camping_id: parseInt(id),
            image_url: img.image_url,
            created_at: img.created_at
          }))
        });
      }

      // Update camping spot
      return await tx.camping_spot.update({
        where: { camping_spot_id: parseInt(id) },
        data: {
          title,
          description,
          max_guests: parseInt(max_guests),
          price_per_night: parseFloat(price_per_night),
          updated_at: new Date()
        },
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

// Update camping spot price
router.patch('/:id/price', async (req, res) => {
  try {
    const { id } = req.params;
    const { price_per_night } = req.body;
    
    // Added more logging for debugging
    console.log('Price update request received:', { id, price_per_night, body: req.body });
    
    // Check if we received price through price_per_night or price field
    let priceValue = price_per_night;
    if (priceValue === undefined && req.body.price !== undefined) {
      priceValue = req.body.price;
    }
    
    if (priceValue === undefined || isNaN(parseFloat(priceValue))) {
      console.error('Invalid price received:', priceValue);
      return res.status(400).json({ error: 'Valid price is required' });
    }
    
    // Parse the price to a float with 2 decimal places
    const formattedPrice = parseFloat(parseFloat(priceValue).toFixed(2));
    
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
        price_per_night: true
      }
    });
    
    console.log('Price updated successfully:', updatedSpot);
    res.json(updatedSpot);
  } catch (error) {
    console.error('Update Price Error:', error);
    res.status(500).json({ error: 'Failed to update camping spot price' });
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
    }

    // Find the camping spot without owner details
    const spot = await prisma.camping_spot.findUnique({
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
    });

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
  } catch (error) {
    console.error('Get Single Spot Error:', error);
    res.status(500).json({ error: 'Failed to fetch camping spot', details: error.message });
  }
});

// New endpoint for fetching camping spot availability
router.get('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    // Validate the camping spot exists
    const spotExists = await prisma.camping_spot.findUnique({
      where: {
        camping_spot_id: parseInt(id)
      }
    });
    
    if (!spotExists) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }
    
    // Convert dates to JavaScript Date objects with validation
    let start, end;
    try {
      start = new Date(startDate);
      end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format');
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    // Find all bookings for this camping spot within the date range
    const bookings = await prisma.bookings.findMany({
      where: {
        camper_id: parseInt(id),
        status_id: {
          in: [2, 4, 5] // Only show confirmed (2), completed (4), and unavailable (5) bookings
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
              {
                start_date: {
                  lte: start
                }
              },
              {
                end_date: {
                  gte: end
                }
              }
            ]
          }
        ]
      },
      select: {
        booking_id: true,
        start_date: true,
        end_date: true,
        status_id: true
      }
    });
    
    res.json({ bookings });
  } catch (error) {
    console.error('Availability Error:', error);
    res.status(500).json({ error: 'Failed to fetch availability data' });
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
      where: {
        booking_id: parseInt(bookingId)
      }
    });
    
    res.json({ message: 'Availability block removed successfully' });
  } catch (error) {
    console.error('Delete Availability Block Error:', error);
    res.status(500).json({ error: 'Failed to remove availability block' });
  }
});

// Get price suggestion for a camping spot
router.get('/:id/price-suggestion', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the camping spot
    const spot = await prisma.camping_spot.findUnique({
      where: {
        camping_spot_id: parseInt(id)
      }
    });

    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    // Get location data if available
    let location = null;
    if (spot.location_id) {
      location = await prisma.location.findUnique({
        where: {
          location_id: spot.location_id
        }
      });
    }

    // Get amenities for this spot
    const spotAmenities = await prisma.camping_spot_amenities.count({
      where: {
        camping_spot_id: parseInt(id)
      }
    });
    
    // Find similar spots for price comparison (simplified approach)
    const allSpots = await prisma.camping_spot.findMany({
      where: {
        camping_spot_id: {
          not: parseInt(id)
        }
      },
      select: {
        price_per_night: true,
        max_guests: true
      }
    });
    
    // Calculate suggested price based on available data
    
    // 1. Base price - either the spot's current price or an average
    let basePrice = spot.price_per_night || 50; // Default if no price set
    
    // 2. Similar spots by guest capacity
    const similarSpots = allSpots.filter(s => 
      Math.abs(s.max_guests - spot.max_guests) <= 2
    );
    
    let similarSpotsAvgPrice = null;
    if (similarSpots.length > 0) {
      similarSpotsAvgPrice = similarSpots.reduce((sum, s) => sum + s.price_per_night, 0) / similarSpots.length;
      // Adjust base price if we have similar spots data
      basePrice = (basePrice + similarSpotsAvgPrice) / 2;
    }
    
    // 3. Determine demand factor (simplified)
    const demandFactor = 1.0;
    
    // 4. Seasonality factor
    const currentMonth = new Date().getMonth();
    // Summer months have higher demand
    const seasonalityFactor = [5, 6, 7, 8].includes(currentMonth) ? 1.15 : 
                              [0, 1, 11].includes(currentMonth) ? 0.85 : 1.0;
    
    // 5. Amenities premium
    const amenitiesFactor = 1 + (Math.min(spotAmenities, 10) / 40); // Max 25% increase for 10+ amenities
    
    // Calculate suggested price with all factors
    let suggestedPrice = basePrice * demandFactor * seasonalityFactor * amenitiesFactor;
    
    // Round to nearest 0.5
    suggestedPrice = Math.round(suggestedPrice * 2) / 2;
    
    // Ensure minimum price
    suggestedPrice = Math.max(10, suggestedPrice);
    
    // Send back the suggestion with details
    res.json({
      suggested_price: suggestedPrice,
      market_details: {
        similar_spots_avg_price: similarSpotsAvgPrice ? Math.round(similarSpotsAvgPrice * 10) / 10 : null,
        demand_factor: Math.round(demandFactor * 100) / 100,
        seasonality_factor: Math.round(seasonalityFactor * 100) / 100,
        amenities_factor: Math.round(amenitiesFactor * 100) / 100,
        occupancy_rate: 0 // We're not calculating this now
      }
    });
  } catch (error) {
    console.error('Price Suggestion Error:', error);
    res.status(500).json({ error: 'Failed to generate price suggestion' });
  }
});

module.exports = router;