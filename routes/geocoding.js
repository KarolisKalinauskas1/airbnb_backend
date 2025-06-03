const express = require('express');
const router = express.Router();
const { geocodeAddress, searchLocations } = require('../utils/geocoding');

// Search for locations based on query
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        
        if (!query) {
            return res.status(400).json({
                error: 'Missing query parameter',
                message: 'Please provide a search query using the q parameter'
            });
        }

        // Search for locations
        const results = await searchLocations(query);
        
        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Geocoding search error:', error);
        res.status(500).json({
            error: 'Geocoding failed',
            message: 'Unable to search for locations at this time'
        });
    }
});

// Geocode a specific address
router.get('/geocode', async (req, res) => {
    try {
        const address = req.query.address;
        
        if (!address) {
            return res.status(400).json({
                error: 'Missing address parameter',
                message: 'Please provide an address to geocode'
            });
        }

        // Geocode the address
        const result = await geocodeAddress(address);
        
        if (!result) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Could not geocode the provided address'
            });
        }

        res.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({
            error: 'Geocoding failed',
            message: 'Unable to geocode address at this time'
        });
    }
});

module.exports = router;
