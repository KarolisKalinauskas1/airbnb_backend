const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Debug logging middleware
router.use((req, res, next) => {
    console.log(`[public-routes] Incoming request: ${req.method} ${req.originalUrl}`);
    console.log('[public-routes] Headers:', req.headers);
    console.log(`[public-routes] Original URL: ${req.originalUrl}, Base URL: ${req.baseUrl}, Path: ${req.path}`);
    next();
});

// Handle preflight requests for all public routes
router.options('*', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Public-Route',
        'Access-Control-Max-Age': '86400'
    }).status(204).end();
});

// Common headers for all public routes
router.use((req, res, next) => {
    res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
    });
    next();
});

// Helper function to handle database errors
const handleDatabaseError = (error, fallbackFn) => {
    console.error('Database error:', error);
    if (error.message && (
        error.message.includes("Can't reach database server") ||
        error.message.includes("Connection refused")
    )) {
        return fallbackFn();
    }
    throw error;
};

// CORS middleware for public routes
router.use((req, res, next) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Public-Route, X-Requested-With',
        'Access-Control-Max-Age': '86400'
    });
    next();
});

/**
 * @route   GET /amenities
 * @desc    Get all amenities
 * @access  Public
 */
router.get('/amenities', async (req, res) => {
    try {
        const amenities = await prisma.amenity.findMany({
            orderBy: { name: 'asc' }
        }).catch(error => handleDatabaseError(error, () => {
            const { getFallbackAmenities } = require('../utils/fallback-data');
            return getFallbackAmenities();
        }));
        
        res.json(amenities || []);
    } catch (error) {
        console.error('Amenities Error:', error);
        res.status(500).json({ error: 'Failed to fetch amenities' });
    }
});

// Alternative path for /api/amenities
router.get('/api/amenities', (req, res, next) => {
    req.url = '/amenities';
    next();
});

// Alternative path for /camping-spots/amenities
router.get('/camping-spots/amenities', (req, res, next) => {
    req.url = '/amenities';
    next();
});

// Alternative path for /api/camping-spots/amenities
router.get('/api/camping-spots/amenities', (req, res, next) => {
    req.url = '/amenities';
    next();
});

/**
 * @route   GET /countries
 * @desc    Get all countries
 * @access  Public
 */
router.get('/countries', async (req, res) => {
    try {
        const countries = await prisma.country.findMany({
            orderBy: { name: 'asc' }
        }).catch(error => handleDatabaseError(error, () => {
            const { getFallbackCountries } = require('../utils/fallback-data');
            return getFallbackCountries();
        }));
        
        res.json(countries || []);
    } catch (error) {
        console.error('Countries Error:', error);
        res.status(500).json({ error: 'Failed to fetch countries' });
    }
});

// Alternative path for /api/countries
router.get('/api/countries', (req, res, next) => {
    req.url = '/countries';
    next();
});

// Alternative path for /camping-spots/countries
router.get('/camping-spots/countries', (req, res, next) => {
    req.url = '/countries';
    next();
});

// Alternative path for /api/camping-spots/countries
router.get('/api/camping-spots/countries', (req, res, next) => {
    req.url = '/countries';
    next();
});

const publicRoutes = [
    // Health and status endpoints
    '/health',
    '/status',
    '/api/health',
    '/api/status',

    // Auth endpoints
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/signin',
    '/api/auth/signup',
    '/api/auth/reset-password',

    // Public data endpoints
    '/api/amenities',
    '/api/countries',
    '/api/camping-spots/amenities',
    '/api/camping-spots/countries',
    '/amenities',
    '/countries'
];

const isPublicRoute = (path) => {
    // Normalize path by removing trailing slash and converting to lowercase
    const normalizedPath = path.toLowerCase().replace(/\/$/, '');

    // Direct match
    if (publicRoutes.some(route => normalizedPath === route.toLowerCase())) {
        return true;
    }

    // Check if the path ends with /amenities or /countries
    if (normalizedPath.endsWith('/amenities') || normalizedPath.endsWith('/countries')) {
        return true;
    }

    return false;
};

module.exports = { publicRoutes, isPublicRoute };
