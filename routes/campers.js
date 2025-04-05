const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { geocodeAddress, calculateDistance } = require('../utils/geocoding');
const cloudinary = require('../utils/cloudinary');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

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
                { end_date: { gte: start } }
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
        }
      }
    });

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

module.exports = router;