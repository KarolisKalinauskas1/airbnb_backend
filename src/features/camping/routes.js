const express = require('express');
const router = express.Router();
const { prisma } = require('../../../config/database');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const cloudinary = require('../../utils/cloudinary');
const { authenticate, optionalAuthenticate } = require('../../middleware/auth');

// All GET routes are public by default

// Create a new camping spot - requires authentication
router.post('/', authenticate, upload.array('images'), async (req, res) => {
  try {
    // Log the request details
    console.log('Creating camping spot. User:', req.user);
    console.log('Request body:', {
      ...req.body,
      files: req.files?.length || 0
    });

    if (!req.user) {
      console.log('No user found in request');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify owner status
    const isOwner = ['1', 1, true, 'true', 'yes', 'YES'].includes(req.user.isowner);
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'You must be registered as an owner to create camping spots'
      });
    }

    // Parse and validate the data
    const price = parseFloat(req.body.price_per_night);
    const guests = parseInt(req.body.max_guests);
    let location;
    let amenities;

    try {
      location = JSON.parse(req.body.location);
      // Parse amenities, handling both string and array formats
      amenities = req.body.amenities ? 
        (typeof req.body.amenities === 'string' ? 
          JSON.parse(req.body.amenities) : 
          req.body.amenities)
        : [];
      
      // Ensure amenities is an array of numbers
      amenities = amenities.map(a => typeof a === 'object' ? parseInt(a.amenity_id) : parseInt(a))
        .filter(id => !isNaN(id));

      console.log('Parsed amenities:', amenities);
    } catch (error) {
      console.error('Error parsing data:', error);
      return res.status(400).json({ 
        error: 'Invalid data format',
        details: error.message
      });
    }

    // Get coordinates from the address
    const { geocodeAddress } = require('../../utils/geocoding');
    
    // First try with full address
    try {
      const coordinates = await geocodeAddress({
        address_line1: location.address_line1,
        address_line2: location.address_line2 || '',
        postal_code: location.postal_code,
        city: location.city,
        country_id: 'be'
      });

      location.latitute = coordinates.latitude;
      location.longtitute = coordinates.longitude;
    } catch (error) {
      // If full address fails, try with just city
      try {
        const coordinates = await geocodeAddress({
          city: location.city,
          country_id: 'be'
        });
        
        location.latitute = coordinates.latitude;
        location.longtitute = coordinates.longitude;
      } catch (cityError) {
        return res.status(400).json({
          error: 'Invalid address',
          message: 'Could not determine the location coordinates. Please check the address.'
        });
      }
    }

    const now = new Date();

    // Create the camping spot with a transaction to ensure all related records are created
    const campingSpot = await prisma.$transaction(async (prisma) => {
      // First create the camping spot with its location
      const spot = await prisma.camping_spot.create({
        data: {
          title: req.body.title,
          description: req.body.description,
          price_per_night: price,
          max_guests: guests,
          created_at: now,
          updated_at: now,
          owner: {
            connect: { owner_id: req.user.user_id }
          },
          location: {
            create: {
              address_line1: location.address_line1,
              address_line2: location.address_line2 || '',
              city: location.city,
              country_id: location.country_id,
              postal_code: location.postal_code,
              latitute: location.latitute.toString(),
              longtitute: location.longtitute.toString()
            }
          }
        }
      });

      // Then create amenity connections if there are any
      if (amenities && amenities.length > 0) {
        await prisma.camping_spot_amenities.createMany({
          data: amenities.map(amenityId => ({
            camping_spot_id: spot.camping_spot_id,
            amenity_id: amenityId
          }))
        });
      }

      return spot;
    });

    // Handle image uploads after spot creation
    let successfulUploads = [];
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(async file => {
        try {
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'camping_spots',
            transformation: [
              { width: 800, height: 600, crop: 'fill', quality: 'auto' }
            ]
          });
          
          return prisma.images.create({
            data: {
              camping_id: campingSpot.camping_spot_id,
              image_url: result.secure_url,
              created_at: now
            }
          });
        } catch (error) {
          console.error('Error uploading image:', error);
          return null;
        }
      });

      successfulUploads = (await Promise.all(imagePromises)).filter(img => img !== null);
    }    // Fetch the complete spot with all relations for response
    const completeSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: campingSpot.camping_spot_id },
      include: {
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        }
      }
    });    res.status(201).json(transformImageUrls(completeSpot));
  } catch (error) {
    console.error('Error creating camping spot:', error);
    res.status(500).json({ 
      error: 'Failed to create camping spot', 
      details: error.message 
    });
  }
});

// Get all camping spots - public endpoint
router.get('/', async (req, res) => {
  try {
    const spot = await prisma.camping_spot.findMany({
      include: {
        owner: true,
        location: {
          include: { country: true }
        },
        images: true,
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: {
          where: { status_id: { not: 5 } },
          select: {
            booking_id: true,
            start_date: true,
            end_date: true,
            status_id: true,
            number_of_guests: true,
            cost: true
          }
        }
      }
    });
    res.json(spot);
  } catch (error) {
    console.error('Error fetching camping spots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch camping spots',
      details: process.env.NODE_ENV === 'development' ? error.stack : error.message
    });
  }
});

// Search camping spots with filters - public endpoint
router.get('/search', async (req, res) => {
  try {
    const { minPrice, maxPrice, guests, startDate, endDate, radius, lat, lng } = req.query;
    const where = {};

    // Parse price filters
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price_per_night = {};
      if (minPrice !== undefined) {
        const min = parseFloat(minPrice);
        if (!isNaN(min)) {
          where.price_per_night.gte = min;
        }
      }
      if (maxPrice !== undefined) {
        const max = parseFloat(maxPrice);
        if (!isNaN(max)) {
          where.price_per_night.lte = max;
        }
      }
      if (Object.keys(where.price_per_night).length === 0) {
        delete where.price_per_night;
      }
    }

    // Parse guest filter
    if (guests) {
      const guestCount = parseInt(guests);
      if (!isNaN(guestCount)) {
        where.max_guests = {
          gte: guestCount
        };
      }
    }

    // Handle date range filtering
    if (startDate && endDate) {
      where.NOT = {
        bookings: {
          some: {
            AND: [
              { start_date: { lte: new Date(endDate) } },
              { end_date: { gte: new Date(startDate) } },
              { status_id: { not: 5 } } // Exclude cancelled bookings
            ]
          }
        }
      };
    }

    // Fetch spots with includes
    const spots = await prisma.camping_spot.findMany({
      where,
      include: {
        owner: true,
        location: {
          include: { country: true }
        },
        images: true,
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: {
          where: { status_id: { not: 5 } },
          select: {
            booking_id: true,
            start_date: true,
            end_date: true,
            status_id: true,
            number_of_guests: true,
            cost: true
          }
        }
      }
    });    // Transform image URLs    spots = spots.map(spot => transformImageUrls(spot));

    // Handle location-based filtering
    let filteredSpots = spots;
    if (radius && lat && lng) {
      const radiusInKm = parseFloat(radius);
      const targetLat = parseFloat(lat);
      const targetLng = parseFloat(lng);

      if (!isNaN(radiusInKm) && !isNaN(targetLat) && !isNaN(targetLng)) {
        filteredSpots = spots.filter(spot => {
          if (!spot.location?.latitude || !spot.location?.longitude) return false;

          const spotLat = parseFloat(spot.location.latitude);
          const spotLng = parseFloat(spot.location.longitude);
          
          if (isNaN(spotLat) || isNaN(spotLng)) return false;

          // Calculate distance using Haversine formula
          const R = 6371; // Earth's radius in kilometers
          const dLat = (spotLat - targetLat) * Math.PI / 180;
          const dLng = (spotLng - targetLng) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(targetLat * Math.PI / 180) * Math.cos(spotLat * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;

          return distance <= radiusInKm;
        });
      }
    }

    res.json(filteredSpots);
  } catch (error) {
    console.error('Error fetching camping spots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch camping spots',
      details: process.env.NODE_ENV === 'development' ? error.stack : error.message
    });
  }
});

// Search camping spots with filters - public endpoint
router.get('/search', async (req, res) => {
  try {
    const { minPrice, maxPrice, guests, startDate, endDate, radius, lat, lng } = req.query;
    const where = {};

    // Parse price filters
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price_per_night = {};
      if (minPrice !== undefined) {
        const min = parseFloat(minPrice);
        if (!isNaN(min)) {
          where.price_per_night.gte = min;
        }
      }
      if (maxPrice !== undefined) {
        const max = parseFloat(maxPrice);
        if (!isNaN(max)) {
          where.price_per_night.lte = max;
        }
      }
      if (Object.keys(where.price_per_night).length === 0) {
        delete where.price_per_night;
      }
    }

    // Parse guest filter
    if (guests) {
      const guestCount = parseInt(guests);
      if (!isNaN(guestCount)) {
        where.max_guests = {
          gte: guestCount
        };
      }
    }

    // Handle date range filtering
    if (startDate && endDate) {
      where.NOT = {
        bookings: {
          some: {
            AND: [
              { start_date: { lte: new Date(endDate) } },
              { end_date: { gte: new Date(startDate) } },
              { status_id: { not: 5 } } // Exclude cancelled bookings
            ]
          }
        }
      };
    }

    // Fetch spots with includes
    const spots = await prisma.camping_spot.findMany({
      where,
      include: {
        owner: true,
        location: {
          include: { country: true }
        },
        images: true,
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: {
          where: { status_id: { not: 5 } },
          select: {
            booking_id: true,
            start_date: true,
            end_date: true,
            status_id: true,
            number_of_guests: true,
            cost: true
          }
        }
      }
    });

    // Handle location-based filtering
    let filteredSpots = spots;
    if (radius && lat && lng) {
      const radiusInKm = parseFloat(radius);
      const targetLat = parseFloat(lat);
      const targetLng = parseFloat(lng);

      if (!isNaN(radiusInKm) && !isNaN(targetLat) && !isNaN(targetLng)) {
        filteredSpots = spots.filter(spot => {
          if (!spot.location?.latitute || !spot.location?.longtitute) return false;

          const spotLat = parseFloat(spot.location.latitute);
          const spotLng = parseFloat(spot.location.longtitute);
          
          if (isNaN(spotLat) || isNaN(spotLng)) return false;

          // Calculate distance using Haversine formula
          const R = 6371; // Earth's radius in kilometers
          const dLat = (spotLat - targetLat) * Math.PI / 180;
          const dLng = (spotLng - targetLng) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(targetLat * Math.PI / 180) * Math.cos(spotLat * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;

          return distance <= radiusInKm;
        });
      }
    }

    res.json(filteredSpots);
  } catch (error) {
    console.error('Error searching camping spots:', error);
    res.status(500).json({ 
      error: 'Failed to search camping spots',
      details: process.env.NODE_ENV === 'development' ? error.stack : error.message
    });
  }
});

// Get a specific camping spot by ID - public endpoint
router.get('/:id', async (req, res) => {
  try {
    const spotId = parseInt(req.params.id);
    if (isNaN(spotId)) {
      return res.status(400).json({ 
        error: 'Invalid ID',
        message: 'Camping spot ID must be a number'
      });
    }

    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      include: {
        owner: true,
        location: {
          include: { country: true }
        },
        images: true,
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: {
          where: { status_id: { not: 5 } }, // Exclude cancelled bookings
          select: {
            booking_id: true,
            start_date: true,
            end_date: true,
            status_id: true,
            number_of_guests: true,
            cost: true
          }
        }
      }
    });

    if (!spot) {
      return res.status(404).json({
        error: 'Not found',
        message: `Camping spot with ID ${spotId} not found`
      });
    }

    res.json(transformImageUrls(spot));
  } catch (error) {
    console.error('Error fetching camping spot:', error);
    res.status(500).json({ 
      error: 'Failed to fetch camping spot',
      details: process.env.NODE_ENV === 'development' ? error.stack : error.message
    });
  }
});

// Update a camping spot by ID - requires authentication
router.put('/:id', authenticate, upload.array('images'), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const spotId = parseInt(req.params.id);
    if (isNaN(spotId)) {
      return res.status(400).json({ 
        error: 'Invalid ID',
        message: 'Camping spot ID must be a number'
      });
    }

    // Verify the spot exists and belongs to the user
    const existingSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      include: {
        location: true,
        camping_spot_amenities: true
      }
    });

    if (!existingSpot) {
      return res.status(404).json({
        error: 'Not found',
        message: `Camping spot with ID ${spotId} not found`
      });
    }

    if (existingSpot.owner_id !== req.user.user_id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update your own camping spots'
      });
    }

    // Parse and validate data from request body
    const location = JSON.parse(req.body.location);
    
    // Parse and normalize amenities data with better error handling
    let amenitiesData;
    try {
      if (!req.body.amenities) {
        // No amenities in request - keep existing ones
        amenitiesData = { add: [], remove: [] };
      } else {
        amenitiesData = JSON.parse(req.body.amenities);
        // Convert array format to selective update format
        if (Array.isArray(amenitiesData)) {
          const newAmenityIds = new Set(amenitiesData.map(a => 
            typeof a === 'object' ? parseInt(a.amenity_id) : parseInt(a)
          ).filter(id => !isNaN(id)));
          
          const existingAmenityIds = new Set(
            existingSpot.camping_spot_amenities.map(a => a.amenity_id)
          );

          // Only remove amenities that are not in the new set
          // Only add amenities that are not in the existing set
          amenitiesData = {
            remove: [...existingAmenityIds].filter(id => !newAmenityIds.has(id)),
            add: [...newAmenityIds].filter(id => !existingAmenityIds.has(id))
          };
        } else {
          // Handle object format {add: [], remove: []}
          amenitiesData.add = (amenitiesData.add || []).map(a => 
            typeof a === 'object' ? parseInt(a.amenity_id) : parseInt(a)
          ).filter(id => !isNaN(id));

          amenitiesData.remove = (amenitiesData.remove || []).map(a => 
            typeof a === 'object' ? parseInt(a.amenity_id) : parseInt(a)
          ).filter(id => !isNaN(id));
        }
      }

      console.log('Normalized amenities for update:', { 
        spotId,
        add: amenitiesData.add,
        remove: amenitiesData.remove,
        originalData: req.body.amenities
      });
    } catch (parseError) {
      console.error('Error parsing amenities data:', parseError);
      return res.status(400).json({
        error: 'Invalid amenities data',
        details: parseError.message
      });
    }

    const price = parseFloat(req.body.price_per_night);
    const guests = parseInt(req.body.max_guests);
    const now = new Date();

    // Run all updates in a transaction
    const updatedSpot = await prisma.$transaction(async (prisma) => {
      // First update the camping spot and location
      const spot = await prisma.camping_spot.update({
        where: { camping_spot_id: spotId },
        data: {
          title: req.body.title,
          description: req.body.description,
          price_per_night: price,
          max_guests: guests,
          updated_at: now,
          location: {
            update: {
              where: { location_id: existingSpot.location.location_id },
              data: {
                address_line1: location.address_line1,
                address_line2: location.address_line2 || '',
                city: location.city,
                postal_code: location.postal_code,
                country_id: location.country_id
              }
            }
          }
        }
      });

      // Handle amenities updates
      if (amenitiesData.remove.length > 0) {
        await prisma.camping_spot_amenities.deleteMany({
          where: { 
            AND: [
              { camping_spot_id: spotId },
              { amenity_id: { in: amenitiesData.remove } }
            ]
          }
        });
      }

      if (amenitiesData.add.length > 0) {
        try {
          await prisma.camping_spot_amenities.createMany({
            data: amenitiesData.add.map(amenityId => ({
              camping_spot_id: spotId,
              amenity_id: amenityId
            })),
            skipDuplicates: true // Avoid duplicate entries
          });
        } catch (error) {
          console.error('Error adding amenities:', error);
          throw new Error('Failed to add amenities. Please check if all amenity IDs are valid.');
        }
      }

      return spot;
    });

    // Handle image uploads after the basic update succeeds
    let successfulUploads = [];
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(async file => {
        try {
          const b64 = Buffer.from(file.buffer).toString('base64');
          const dataURI = `data:${file.mimetype};base64,${b64}`;
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'camping_spots',
            transformation: [
              { width: 800, height: 600, crop: 'fill', quality: 'auto' }
            ]
          });
          
          return prisma.images.create({
            data: {
              camping_id: spotId,
              image_url: result.secure_url,
              created_at: now
            }
          });
        } catch (error) {
          console.error('Error uploading image:', error);
          return null;
        }
      });

      successfulUploads = (await Promise.all(imagePromises)).filter(img => img !== null);
    }

    // Get the complete updated spot with all its relations
    const finalSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
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

    return res.json(transformImageUrls(finalSpot));
  } catch (error) {
    console.error('Error updating camping spot:', error);
    res.status(500).json({
      error: 'Failed to update camping spot',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete a camping spot - requires authentication and ownership
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const spotId = parseInt(req.params.id);
    if (isNaN(spotId)) {
      return res.status(400).json({ 
        error: 'Invalid ID',
        message: 'Camping spot ID must be a number'
      });
    }

    // Check if the spot exists and belongs to the user
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      include: {
        images: true,
        location: true,
        camping_spot_amenities: true
      }
    });

    if (!spot) {
      return res.status(404).json({
        error: 'Not found',
        message: `Camping spot with ID ${spotId} not found`
      });
    }

    if (spot.owner_id !== req.user.user_id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only delete your own camping spots'
      });
    }

    // Delete related images from Cloudinary
    if (spot.images && spot.images.length > 0) {
      const deletePromises = spot.images.map(image => {
        const publicId = `camping_spots/${image.image_url}`;
        return cloudinary.uploader.destroy(publicId);
      });
      await Promise.all(deletePromises);
    }

    // Use a transaction to ensure all deletions happen or none of them do
    await prisma.$transaction(async (prisma) => {      // 1. Delete all reviews associated with bookings of this spot
      await prisma.review.deleteMany({
        where: {
          bookings: {
            camper_id: spotId
          }
        }
      });      // 2. Delete all transactions associated with bookings of this spot
      await prisma.transaction.deleteMany({
        where: {
          bookings: {
            camper_id: spotId
          }
        }
      });

      // 3. Delete all bookings
      await prisma.bookings.deleteMany({
        where: {
          camper_id: spotId
        }
      });

      // 4. Delete all amenity connections
      await prisma.camping_spot_amenities.deleteMany({
        where: {
          camping_spot_id: spotId
        }
      });

      // 5. Delete all images
      await prisma.images.deleteMany({
        where: {
          camping_id: spotId
        }
      });

      // 6. Delete the camping spot
      await prisma.camping_spot.delete({
        where: {
          camping_spot_id: spotId
        }
      });

      // 7. Finally, delete the location
      await prisma.location.delete({
        where: {
          location_id: spot.location_id
        }
      });
    });

    res.json({ message: 'Camping spot deleted successfully' });
  } catch (error) {
    console.error('Error deleting camping spot:', error);
    res.status(500).json({ 
      error: 'Failed to delete camping spot',
      details: error.message
    });
  }
});

// Check availability for a specific camping spot - public endpoint
router.get('/:id/availability', async (req, res) => {
  try {
    const spotId = parseInt(req.params.id);
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'Start date and end date are required'
      });
    }    // Get all bookings for this camping spot in the date range
    const bookings = await prisma.bookings.findMany({
      where: {
        camping_spot: {
          camping_spot_id: spotId
        },
        status_id: { in: [1, 2, 5] }, // Pending, Confirmed, or Unavailable
        OR: [
          {
            AND: [
              { start_date: { lte: new Date(endDate) } },
              { end_date: { gte: new Date(startDate) } }
            ]
          }
        ]
      },
      select: {
        start_date: true,
        end_date: true,
        status_id: true
      }
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      error: 'Failed to check availability',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Check price suggestions for a specific camping spot - public endpoint
router.get('/:id/price-suggestion', async (req, res) => {
  try {
    const spotId = parseInt(req.params.id);

    // Get the camping spot
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      include: {
        camping_spot_amenities: {
          include: { amenity: true }
        },
        location: true,
        bookings: {
          where: { status_id: { not: 5 } } // Exclude cancelled bookings
        }
      }
    });

    if (!spot) {
      return res.status(404).json({
        error: 'Not found',
        message: `Camping spot with ID ${spotId} not found`
      });
    }    // Calculate base price suggestion based on various factors
    let basePrice = parseFloat(spot.price_per_night);
    if (isNaN(basePrice) || basePrice <= 0) {
      // Use average price of other spots in similar categories, or default to 50
      const otherSpots = await prisma.camping_spot.findMany({
        where: {
          NOT: {
            camping_spot_id: spot.camping_spot_id
          },
          price_per_night: {
            gt: 0
          },
          // Consider spots with similar amenity count for better comparison
          camping_spot_amenities: {
            some: {}
          }
        },
        include: {
          camping_spot_amenities: true
        }
      });

      if (otherSpots.length > 0) {
        // Filter spots with similar amenity count (±2 amenities)
        const spotAmenityCount = spot.camping_spot_amenities?.length || 0;
        const similarSpots = otherSpots.filter(s => {
          const amenityDiff = Math.abs((s.camping_spot_amenities?.length || 0) - spotAmenityCount);
          return amenityDiff <= 2;
        });

        // Use similar spots if available, otherwise use all spots
        const spotsToAverage = similarSpots.length > 0 ? similarSpots : otherSpots;
        const avgPrice = spotsToAverage.reduce((sum, s) => sum + parseFloat(s.price_per_night), 0) / spotsToAverage.length;
        basePrice = Math.max(50, Math.round(avgPrice)); // Round to nearest integer
      } else {
        basePrice = 50; // Default minimum if no other spots exist
      }
    }

    // Calculate amenity bonus with weighted values
    const amenityWeights = {
      'WiFi': 10,
      'Electricity': 10,
      'Water': 10,
      'Bathroom': 15,
      'Kitchen': 15,
      'Parking': 8,
      'Showers': 12,
      'BBQ': 8,
      'Picnic Area': 5
    };
    
    let amenityBonus = 0;
    spot.camping_spot_amenities?.forEach(amenity => {
      if (amenity.amenity?.name) {
        amenityBonus += amenityWeights[amenity.amenity.name] || 5; // Default 5 for unlisted amenities
      }
    });

    // Calculate location bonus based on city popularity and other factors
    let locationBonus = 0;
    if (spot.location) {
      // Base city bonus
      locationBonus += spot.location.city ? 15 : 0;
      
      // Add country bonus
      locationBonus += spot.location.country ? 10 : 0;
      
      // Add region/state bonus if available
      locationBonus += spot.location.region ? 5 : 0;
    }

    // Occupancy and demand calculation with seasonal adjustment
    const totalBookings = spot.bookings?.length || 0;
    const recentBookings = spot.bookings?.filter(b => {
      const bookingDate = new Date(b.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return bookingDate >= thirtyDaysAgo;
    }).length || 0;

    // Calculate occupancy rate giving more weight to recent bookings
    const occupancyRate = Math.min(1, (totalBookings + recentBookings * 2) / (30 * 3));
    
    // Seasonal adjustment (higher multiplier during peak season)
    const currentMonth = new Date().getMonth();
    const isPeakSeason = currentMonth >= 5 && currentMonth <= 8; // June to September
    const seasonalMultiplier = isPeakSeason ? 1.2 : 1;
    
    // Calculate demand multiplier: ±20% based on occupancy, then seasonal adjustment
    const demandAdjustment = (occupancyRate - 0.5) * 0.4; // from -0.2 (low) to +0.2 (high)
    const demandMultiplier = (1 + demandAdjustment) * seasonalMultiplier;

    // Count similar spots in the same city (excluding this spot)
    const similarSpotCount = await prisma.camping_spot.count({
      where: {
        camping_spot_id: { not: spotId },
        price_per_night: { gt: 0 },
        location: { city: spot.location.city }
      }
    });
    // Define supply factor: reduce price by 2% per similar spot, capped at 20% max
    const supplyFactor = Math.max(0.8, 1 - similarSpotCount * 0.02);

    // Calculate final suggested price
    // Determine current price per night
    const currentPrice = parseFloat(spot.price_per_night) || 0;
    // Calculate raw suggested price and apply floor
    const rawSuggestedPrice = (basePrice + amenityBonus + locationBonus) * demandMultiplier * supplyFactor;
    let suggestedPrice = Math.max(50, Math.round(rawSuggestedPrice));
    // Do not suggest more than 10€ below the current price
    if (suggestedPrice < currentPrice - 10) {
      suggestedPrice = currentPrice - 10;
    }

    // Determine if update is needed and reason
    const priceDiff = suggestedPrice - currentPrice;
    const should_update = priceDiff !== 0;
    let reason = '';
    if (priceDiff > 0) {
      reason = `Suggested price is €${priceDiff} higher than current price.`;
    } else if (priceDiff < 0) {
      reason = `Suggested price is €${Math.abs(priceDiff)} lower than current price.`;
    }

    // Calculate a reasonable price range (±15% from suggested price)
    const minPrice = Math.max(50, Math.round(suggestedPrice * 0.85));
    const maxPrice = Math.round(suggestedPrice * 1.15);

    // Build factors object
    const factors = {
      basePrice,
      amenityBonus,
      locationBonus,
      occupancyRate: Math.round(occupancyRate * 100),
      demandMultiplier: parseFloat(demandMultiplier.toFixed(2)),
      isSeasonalPricing: isPeakSeason,
      totalBookings,
      recentBookings,
      similarSpots: similarSpotCount,
      supplyFactor: parseFloat(supplyFactor.toFixed(2))
    };
    // If the spot price was updated recently (within 7 days), skip suggestion
    const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    if (spot.updated_at && (new Date() - new Date(spot.updated_at)) < RECENT_WINDOW_MS) {
      return res.json({
        currentPrice,
        suggestedPrice: currentPrice,
        should_update: false,
        reason: 'Price updated recently',
        priceRange: { min: currentPrice, max: currentPrice },
        factors
      });
    }
    // Default suggestion response
    res.json({
      currentPrice,
      suggestedPrice,
      should_update,
      reason,
      priceRange: { min: minPrice, max: maxPrice },
      factors
    });
  } catch (error) {
    console.error('Error generating price suggestion:', error);
    res.status(500).json({
      error: 'Failed to generate price suggestion',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Block dates for a camping spot - requires authentication and ownership
router.post('/:id/availability', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const spotId = parseInt(req.params.id);
    console.log('Blocking dates for spot:', spotId, 'Request body:', req.body);
    const { startDate, endDate } = req.body;

    // Validate required fields
    if (!startDate || !endDate) {
      console.log('Missing parameters:', { startDate, endDate });
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'Start date and end date are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    console.log('Parsed dates:', { start, end });

    // Validate date format
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.log('Invalid date format:', { startDate, endDate });
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Please provide dates in YYYY-MM-DD format'
      });
    }

    // Validate start date isn't in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      console.log('Start date in past:', { start, today });
      return res.status(400).json({
        error: 'Invalid dates',
        message: 'Start date cannot be in the past'
      });
    }

    // Validate end date is after start date
    if (end <= start) {
      console.log('End date not after start:', { start, end });
      return res.status(400).json({
        error: 'Invalid dates',
        message: 'End date must be after start date'
      });
    }

    // Verify the spot exists and belongs to the user
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId },
      select: { owner_id: true }
    });

    if (!spot) {
      console.log('Spot not found:', spotId);
      return res.status(404).json({
        error: 'Not found',
        message: `Camping spot with ID ${spotId} not found`
      });
    }

    if (spot.owner_id !== req.user.user_id) {
      console.log('Unauthorized owner:', { spotOwnerId: spot.owner_id, requestUserId: req.user.user_id });
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only block dates for your own camping spots'
      });
    }

    // Check for overlapping blocked dates or bookings using the correct relation syntax
    const existingBookings = await prisma.bookings.findMany({
      where: {
        camping_spot: {
          camping_spot_id: spotId
        },
        status_id: { in: [1, 2, 5] }, // 1: Pending, 2: Confirmed, 5: Blocked
        AND: [
          { start_date: { lte: end } },
          { end_date: { gte: start } }
        ]
      }
    });

    console.log('Found existing bookings:', existingBookings);

    if (existingBookings.length > 0) {
      return res.status(400).json({
        error: 'Date conflict',
        message: 'The selected dates overlap with existing bookings or blocked dates'
      });
    }

    // Get or create blocked status
    let blockedStatus = await prisma.status_booking_transaction.findFirst({
      where: { status_id: 5 } // Use status ID 5 for blocked bookings
    });

    if (!blockedStatus) {
      return res.status(500).json({
        error: 'Configuration error',
        message: 'Blocked status not found in database'
      });    }    // Create a blocked booking
    const blockedBooking = await prisma.bookings.create({
      data: {
        camping_spot: {
          connect: { camping_spot_id: spotId }
        },
        start_date: start,
        end_date: end,
        status_booking_transaction: {
          connect: { status_id: 5 } // Connect to blocked status
        },
        users: {
          connect: { user_id: req.user.user_id }
        },
        number_of_guests: 0,
        cost: 0,
        created_at: new Date()
      }
    });

    console.log('Successfully blocked dates:', {
      spotId,
      startDate: start,
      endDate: end,
      bookingId: blockedBooking.booking_id
    });

    res.status(201).json(blockedBooking);
  } catch (error) {
    console.error('Error blocking dates:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      error: 'Failed to block dates',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update price for a specific camping spot - requires authentication and ownership
router.patch('/:id/price', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const spotId = parseInt(req.params.id, 10);
    const { price } = req.body;
    const newPrice = parseFloat(price);
    if (isNaN(newPrice) || newPrice <= 0) {
      return res.status(400).json({ error: 'Invalid price', message: 'Price must be a positive number' });
    }
    // Verify camping spot exists and owner matches
    const spot = await prisma.camping_spot.findUnique({ where: { camping_spot_id: spotId } });
    if (!spot) {
      return res.status(404).json({ error: 'Not Found', message: `Camping spot ${spotId} not found` });
    }
    // Check ownership flag or user id field (adjust as needed)
    // Ensure the authenticated user owns the spot
    const userId = typeof req.user.user_id === 'string' ? parseInt(req.user.user_id, 10) : req.user.user_id;
    if (spot.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied', message: 'Not owner of this camping spot' });
    }
    // Perform the update
    const updated = await prisma.camping_spot.update({
      where: { camping_spot_id: spotId },
      data: { price_per_night: newPrice }
    });
    res.json({ price_per_night: updated.price_per_night });
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ error: 'Failed to update price', details: error.message });
  }
});

// Get reviews for a specific camping spot - public endpoint
router.get('/:id/reviews', async (req, res) => {
  try {
    console.log('Fetching reviews for camping spot:', req.params.id);
    const spotId = parseInt(req.params.id);
    if (isNaN(spotId)) {
      return res.status(400).json({ 
        error: 'Invalid ID',
        message: 'Camping spot ID must be a number'
      });
    }

    // First verify the camping spot exists
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: spotId }
    });

    if (!spot) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No camping spot found with ID ${spotId}`
      });
    }

    // Get reviews for this spot's bookings
    const reviews = await prisma.review.findMany({
      where: { 
        bookings: {
          camping_spot: {
            camping_spot_id: spotId
          }
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

    // Format the response, with better error handling for invalid data
    const formattedReviews = reviews.map(review => {
      try {
        return {
          review_id: review.review_id,
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          user: review.bookings?.users || { full_name: 'Anonymous' }
        };
      } catch (err) {
        console.error('Error formatting review:', err);
        // Provide a sanitized review object if there's an error
        return {
          review_id: review.review_id || 0,
          rating: review.rating || 0,
          comment: review.comment || 'No comment provided',
          created_at: review.created_at || new Date(),
          user: { full_name: 'Anonymous' }
        };
      }
    });

    res.json(formattedReviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ 
      error: 'Failed to fetch reviews',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all camping spots with filters - public endpoint
router.get('/search', async (req, res) => {
  try {
    const { minPrice, maxPrice, guests, startDate, endDate, radius, latitude, longitude } = req.query;
    const where = {};

    // Parse price filters
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price_per_night = {};
      if (minPrice !== undefined) {
        const min = parseFloat(minPrice);
        if (!isNaN(min)) {
          where.price_per_night.gte = min;
        }
      }
      if (maxPrice !== undefined) {
        const max = parseFloat(maxPrice);
        if (!isNaN(max)) {
          where.price_per_night.lte = max;
        }
      }
      if (Object.keys(where.price_per_night).length === 0) {
        delete where.price_per_night;
      }
    }

    // Parse guest filter
    if (guests) {
      const guestCount = parseInt(guests);
      if (!isNaN(guestCount)) {
        where.max_guests = {
          gte: guestCount
        };
      }
    }

    // Handle date range filtering
    if (startDate && endDate) {
      where.NOT = {
        bookings: {
          some: {
            AND: [
              { start_date: { lte: new Date(endDate) } },
              { end_date: { gte: new Date(startDate) } },
              { status_id: { not: 5 } } // Exclude cancelled bookings
            ]
          }
        }
      };
    }

    // Fetch spots with includes
    const spots = await prisma.camping_spot.findMany({
      where,
      include: {
        owner: true,
        location: {
          include: { country: true }
        },
        images: true,
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: {
          where: { status_id: { not: 5 } },
          select: {
            booking_id: true,
            start_date: true,
            end_date: true,
            status_id: true,
            number_of_guests: true,
            cost: true
          }
        }
      }
    });

    // Handle location-based filtering
    let filteredSpots = spots;
    if (radius && latitude && longitude) {
      const radiusInKm = parseFloat(radius);
      const targetLat = parseFloat(latitude);
      const targetLng = parseFloat(longitude);

      if (!isNaN(radiusInKm) && !isNaN(targetLat) && !isNaN(targetLng)) {
        filteredSpots = spots.filter(spot => {
          if (!spot.location?.latitute || !spot.location?.longtitute) return false;

          const spotLat = parseFloat(spot.location.latitute);
          const spotLng = parseFloat(spot.location.longtitute);
          
          if (isNaN(spotLat) || isNaN(spotLng)) return false;

          // Calculate distance using Haversine formula
          const R = 6371; // Earth's radius in kilometers
          const dLat = (spotLat - targetLat) * Math.PI / 180;
          const dLng = (spotLng - targetLng) * Math.PI / 180;
          const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(targetLat * Math.PI / 180) * Math.cos(spotLat * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;

          return distance <= radiusInKm;
        });
      }
    }

    res.json(filteredSpots);
  } catch (error) {
    console.error('Error searching camping spots:', error);
    res.status(500).json({ 
      error: 'Failed to search camping spots',
      details: process.env.NODE_ENV === 'development' ? error.stack : error.message
    });
  }
});

// Helper function to transform image URLs
const transformImageUrls = (spot) => {
  return spot;
};

module.exports = router;
