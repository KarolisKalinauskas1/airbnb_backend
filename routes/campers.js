const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/* GET home page. */
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate, city, country } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Missing startDate or endDate" });
    }

    // Build filter dynamically
    const locationFilter = {};
    if (city) {
      locationFilter.city = city;
    }
    if (country) {
      locationFilter.country = {
        name: country,
      };
    }

    const whereClause = {};
    if (Object.keys(locationFilter).length > 0) {
      whereClause.locations = locationFilter; // ✅ corrected: use 'locations'
    }

    const campingSpots = await prisma.camping_spot.findMany({
      where: whereClause,
      include: {
        locations: {
          select: {
            city: true,
            longtitute: true,
            latitute: true,
            country: { select: { name: true } },
          },
        },
        images: {
          select: { image_url: true },
          take: 1,
        },
      },
    });

    const availableCampingSpots = [];

    for (const spot of campingSpots) {
      const bookings = await prisma.bookings.findMany({
        where: {
          camper_id: spot.camping_spot_id,
          OR: [
            {
              start_date: {
                lte: new Date(endDate),
              },
              end_date: {
                gte: new Date(startDate),
              },
            },
          ],
        },
      });

      if (bookings.length === 0) {
        availableCampingSpots.push(spot);
      }
    }

    res.json(availableCampingSpots.map(spot => ({
      ...spot,
      price_per_night: spot.price_per_night
    })));
  } catch (error) {
    console.error("Error fetching camping spots:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



  
//! Post method to create camping spot
router.post('/', async (req, res, next) => {
    try {
        // Extract data from the request body
        const { title, description, max_guests, price_per_night, address, city, country_name, postal_code, longtitute, latitute, owner_id } = req.body;
    
        // Validate required fields
        if (!title || !description || !max_guests || !price_per_night || !city || !country_name || !postal_code || !longtitute || !latitute || !owner_id) {
          return res.status(400).json({ error: "All fields are required." });
        }
    
        // Step 1: Check if the country exists, if not, create it
        let country = await prisma.country.findFirst({ where: { name: country_name } });
        if (!country) {
          country = await prisma.country.create({
            data: { name: country_name },
          });
        }
    
        // Step 2: Check if the location exists, if not, create it
        let location = await prisma.location.findFirst({
          where: { address_line1: address, city: city, country_id: country.country_id },
        });
    
        if (!location) {
          location = await prisma.location.create({
            data: {
              address_line1: address,
              city: city,
              country_id: country.country_id, // Reference the existing/new country
              postal_code: postal_code,
              longtitute: longtitute,
              latitute: latitute,
            },
          });
        }
    
        // Step 3: Create a new camping spot
        const newCampingSpot = await prisma.camping_spot.create({
          data: {
            title,
            description,
            max_guests,
            price_per_night,
            location_id: location.location_id, // Use existing/new location
            owner_id,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
    
        res.status(201).json({ message: "Camping spot created!", campingSpot: newCampingSpot });
      } catch (error) {
        console.error("Error adding camping spot:", error);
        res.status(500).json({ error: "Internal server error" });
      }

});


router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const spot = await prisma.camping_spot.findUnique({
      where: {
        camping_spot_id: Number(id),
      },
      include: {
        locations: {
          select: {
            city: true,
            latitute: true,
            longtitute: true,
            country: {
              select: {
                name: true,
              },
            },
          },
        },
        images: {
          select: {
            image_url: true,
          },
        },
        bookings: {
          select: {
            start_date: true,
            end_date: true,
            review: {
              select: {
                rating: true,
                comment: true,
                created_at: true,
              },
            },
            users: {
              select: {
                full_name: true,
              },
            },
          },
        },
        camping_spot_amenities: {
          select: {
            amenity: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }

    // 📦 Flatten amenities
    const amenities = spot.camping_spot_amenities.map(a => a.amenity.name);

    // 📦 Extract public reviews only
    const reviews = spot.bookings
      .filter(b => b.review !== null)
      .map(b => ({
        rating: b.review.rating,
        comment: b.review.comment,
        date: b.review.created_at,
        reviewer: b.users.full_name,
      }));

    // 📦 Only extract availability data (no user info)
    const unavailableDates = spot.bookings.map(b => ({
      start_date: b.start_date,
      end_date: b.end_date,
    }));

    // ✅ Construct final clean response
    const formattedSpot = {
      camping_spot_id: spot.camping_spot_id,
      title: spot.title,
      description: spot.description,
      max_guests: spot.max_guests,
      price_per_night: spot.price_per_night,
      locations: spot.locations,
      images: spot.images,
      amenities,
      reviews,
      unavailableDates,
    };

    res.json(formattedSpot);
  } catch (error) {
    console.error('Error fetching camping spot by ID:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});





module.exports = router;``