const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/* GET home page. */
router.get("/", async (req, res) => {
    try {
        const campingSpots = await prisma.camping_spot.findMany({
          include: {  
            locations: { select: { city: true } }, 
            images: { select: { image_url: true }, take: 1 },
          },
        });
    
        res.json(campingSpots);
      } catch (error) {
        console.error("Error fetching camping spots:", error);
        res.status(500).json({ error: "Internal server error" });
      }
  });
  
// Post method to create camping spot
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






module.exports = router;