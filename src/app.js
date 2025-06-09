const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const logger = require('morgan');
const compression = require('compression');
const { prisma, ensureConnection } = require('../config/prisma');
const routeAccessMiddleware = require('./middleware/route-access.js');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./features/users/routes');
const campingSpotsRoutes = require('./features/camping/routes');
const bookingRoutes = require('./features/bookings');
const reviewRoutes = require('./routes/reviews');
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

// Debug: Log all incoming requests
app.use((req, res, next) => {
  console.log('[APP DEBUG] Incoming request:', req.method, req.url, req.path);
  next();
});

// Basic middleware setup
app.use(logger('dev'));

// Unified CORS configuration
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'http://localhost:5173',  // Vite dev server
        'http://localhost:3000',  // Backend server
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000'
    ];
    
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Public-Route, X-CSRF-Token');
        res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization');
        res.header('Vary', 'Origin');

        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Max-Age', '86400');
            return res.status(204).end();
        }
    }
    next();
});

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
console.log('[APP DEBUG] Mounting route /api/auth');
app.use('/api/auth', authRoutes);

// Protected routes - require authentication
console.log('[APP DEBUG] Mounting route /api/users');
app.use('/api/users', authenticate, userRoutes);
console.log('[APP DEBUG] Mounting route /api/bookings');
app.use('/api/bookings', bookingRoutes); // Authentication handled within route
console.log('[APP DEBUG] Mounting route /api/checkout');
app.use('/api/checkout', authenticate, require('./routes/checkout'));
console.log('[APP DEBUG] Mounting route /api/reviews');
app.use('/api/reviews', reviewRoutes);
console.log('[APP DEBUG] Mounting route /api/dashboard');
app.use('/api/dashboard', dashboardRoutes); // Authentication handled within routes

// Debug routes (only in development)
if (process.env.NODE_ENV === 'development') {
    const debugRoutes = require('../routes/debug');
    app.use('/api/debug', debugRoutes);
}

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