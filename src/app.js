const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const logger = require('morgan');
const compression = require('compression');
const { prisma, ensureConnection } = require('../config/prisma');
const routeAccessMiddleware = require('./middleware/route-access.js');

// Import routes
const authRoutes = require('./features/auth/routes');
const userRoutes = require('./features/users/routes');
const campingSpotsRoutes = require('./features/camping/routes');
const bookingRoutes = require('./features/bookings');
const reviewRoutes = require('./features/reviews/routes');
const dashboardRoutes = require('./features/dashboard/routes');
const geocodingRoutes = require('../routes/geocoding');
const amenitiesRoutes = require('../routes/amenities');
const publicRoutes = require('./routes/public');

// Import middleware
const { paymentLimiter, authLimiter, apiLimiter, strictAuthLimiter } = require('../middlewares/rate-limit');
const { errorHandler } = require('../middlewares/error-handler');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth');
const session = require('express-session');

// Create Express app
const app = express();

// Basic middleware setup
app.use(logger('dev'));

// Ensure database connection middleware
app.use(async (req, res, next) => {
    try {
        await ensureConnection();
        next();
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({
            error: 'Database connection error',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(compression());

// Apply security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Basic CORS handling for all routes
app.use((req, res, next) => {
    // Set basic CORS headers for all requests
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
    res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization');
    
    // Set 204 for preflight
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Max-Age', '86400');
        return res.status(204).end();
    }

    next();
});

// Ensure proper headers for all responses
app.use((req, res, next) => {
    if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
    }
    if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'no-cache');
    }
    next();
});

// Health check routes
app.get(['/health', '/api/health'], (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Mount routes in order of authorization requirements
// Public routes first - no authentication needed
const amenitiesRouter = require('../routes/amenities');
const campingSpotsRouter = require('../routes/camping-spots');

// Handle amenities routes with correct headers
app.get(['/api/amenities', '/api/camping-spots/amenities'], async (req, res) => {
    // Add CORS headers for public endpoint
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
        'Cache-Control': 'public, max-age=300'
    });

    try {
        const amenities = await prisma.amenity.findMany({
            orderBy: { name: 'asc' }
        });
        
        if (!amenities || amenities.length === 0) {
            return res.status(404).json({ error: 'No amenities found' });
        }
        
        res.json(amenities);
    } catch (error) {
        console.error('Error fetching amenities:', error);
        res.status(500).json({ 
            error: 'Failed to fetch amenities',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Handle countries routes with correct headers
app.get(['/api/countries', '/api/camping-spots/countries'], async (req, res) => {
    // Add CORS headers for public endpoint
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
        'Cache-Control': 'public, max-age=300'
    });

    try {
        const countries = await prisma.country.findMany({
            orderBy: { name: 'asc' }
        });
        
        if (!countries || countries.length === 0) {
            return res.status(404).json({ error: 'No countries found' });
        }
        
        res.json(countries);
    } catch (error) {
        console.error('Error fetching countries:', error);
        res.status(500).json({ 
            error: 'Failed to fetch countries',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Handle camping spots routes - uses routes from src/features/camping/routes.js
app.use('/api/camping-spots', campingSpotsRoutes);

// Authentication routes - these handle their own auth
app.use('/api/auth', authRoutes);

// Protected routes - require authentication
app.use('/api/users', authenticate, userRoutes);
app.use('/api/bookings', bookingRoutes); // Authentication handled within route
app.use('/api/checkout', authenticate, require('./routes/checkout'));
app.use('/api/reviews', authenticate, reviewRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);

// A simple error handler for 404s
app.use((req, res, next) => {
    const error = new Error('Not Found');
    error.status = 404;
    next(error);
});

// Error handling middleware - must be last
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
        status: err.status || 500
    });
});

module.exports = app;