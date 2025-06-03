const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// Public endpoint for getting all amenities
router.get('/', async (req, res) => {
    try {
        // Set CORS headers for public access
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept, Origin');
        res.header('Cache-Control', 'public, max-age=300');

        const amenities = await prisma.amenity.findMany({
            orderBy: { name: 'asc' }
        });

        if (!amenities || amenities.length === 0) {
            return res.status(404).json({ error: 'No amenities found' });
        }

        return res.json(amenities);
    } catch (error) {
        console.error('Error fetching amenities:', error);
        return res.status(500).json({ 
            error: 'Failed to fetch amenities',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Handle preflight requests
router.options('/', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Max-Age', '86400');
    res.status(204).end();
});

module.exports = router;
