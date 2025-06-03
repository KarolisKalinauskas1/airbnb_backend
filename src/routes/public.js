const express = require('express');
const router = express.Router();
const { PrismaClient, PrismaClientInitializationError } = require('@prisma/client');
const prisma = new PrismaClient();

// Common error handler for database connection issues
const handleDatabaseError = async (operation, fallbackFn) => {
  try {
    return await operation();
  } catch (dbError) {
    console.error(`Database error during ${operation.name}:`, dbError);
    if (dbError instanceof PrismaClientInitializationError || 
        dbError.message?.includes("Can't reach database server") || 
        dbError.message?.includes("Connection refused")) {
      console.log('Using fallback data due to database connection error');
      return fallbackFn ? fallbackFn() : [];
    }
    throw dbError;
  }
};

// Get amenities - PUBLIC ENDPOINT
router.get(['/camping-spots/amenities', '/amenities'], async (req, res) => {
  console.log('Processing public amenities request');
  try {
    const amenities = await handleDatabaseError(
      async () => {
        console.log('Fetching amenities from database');
        const result = await prisma.amenity.findMany({
          orderBy: { name: 'asc' }
        });
        console.log(`Successfully retrieved ${result.length} amenities`);
        return result;
      },
      () => {
        const { getFallbackAmenities } = require('../utils/fallback-data');
        return getFallbackAmenities();
      }
    );
    
    // Set CORS and cache headers explicitly
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, X-Public-Route',
      'Cache-Control': 'public, max-age=300'
    });
    
    res.json(amenities);
  } catch (error) {
    console.error('Amenities Error:', error);
    res.status(500).json({ error: 'Failed to fetch amenities' });
  }
});

// Get countries - PUBLIC ENDPOINT
router.get(['/camping-spots/countries', '/countries'], async (req, res) => {
  console.log('Processing public countries request');
  try {
    const countries = await handleDatabaseError(
      async () => {
        console.log('Fetching countries from database');
        const result = await prisma.country.findMany({
          orderBy: { name: 'asc' }
        });
        console.log(`Successfully retrieved ${result.length} countries`);
        return result;
      },
      () => {
        const { getFallbackCountries } = require('../utils/fallback-data');
        return getFallbackCountries();
      }
    );
    
    // Set CORS and cache headers explicitly
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, X-Public-Route',
      'Cache-Control': 'public, max-age=300'
    });
    
    res.json(countries);
  } catch (error) {
    console.error('Countries Error:', error);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

// Handle OPTIONS requests explicitly
router.options('*', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, X-Public-Route'
  }).sendStatus(200);
});

module.exports = router;
