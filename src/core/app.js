const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('morgan');
const compression = require('compression');
const { prisma } = require('../config/database');
const corsMiddleware = require('./middleware/new-cors-config.js');
const { authenticate } = require('../middleware/auth');
const authRoutes = require('../routes/auth');
const session = require('express-session');
const campingSpotsRoutes = require('../features/camping/routes');

// Create Express app
const app = express();

// Basic middleware setup
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(compression());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    name: 'camping.sid',
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration with credentials support
app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    
    // Always set basic CORS headers
    res.header('Access-Control-Allow-Origin', origin);
    if (origin !== '*') {
        res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Max-Age', '86400');
        return res.status(204).end();
    }
    
    next();
});

// Configure CORS for public endpoints
const publicEndpoints = [
    '/api/amenities',
    '/api/countries',
    '/api/camping-spots/amenities',
    '/api/camping-spots/countries'
];

// Apply CORS and cache headers to public endpoints
app.use((req, res, next) => {
    // Always set CORS headers for OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
            'Access-Control-Max-Age': '86400'
        });
        return res.status(204).end();
    }

    // For public endpoints, add appropriate headers
    if (publicEndpoints.some(path => req.path === path)) {
        res.set({
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
            'Access-Control-Allow-Credentials': 'true'
        });
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

// Mount auth routes first (they handle their own auth)
app.use('/api/auth', authRoutes);

// Public amenities endpoint with explicit response handlers
app.get(['/api/amenities', '/api/camping-spots/amenities'], async (req, res) => {
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
            'Access-Control-Max-Age': '86400'
        });
        return res.status(204).end();
    }

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

// Public countries endpoint with explicit response handlers
app.get(['/api/countries', '/api/camping-spots/countries'], async (req, res) => {
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
            'Access-Control-Max-Age': '86400'
        });
        return res.status(204).end();
    }

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

// Handle camping spots routes - uses routes from src/features/camping/routes.js which handles auth properly
app.use('/api/camping-spots', campingSpotsRoutes);

// Protected routes - require authentication
app.use('/api/users', authenticate, userRoutes);
app.use('/api/bookings', authenticate, bookingRoutes);
app.use('/api/reviews', authenticate, reviewRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    if (err) {
        console.error('API Error:', {
            path: req.path,
            method: req.method,
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });

        if (err.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation Error',
                message: err.message,
                details: err.details
            });
        }

        if (err.name === 'PrismaClientKnownRequestError') {
            return res.status(400).json({
                error: 'Database Error',
                message: 'Invalid data provided',
                code: err.code
            });
        }

        // Default error response
        res.status(err.status || 500).json({
            error: err.message || 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Helper function to add CORS and cache headers for public routes
const addPublicRouteHeaders = (res) => {
    res.set({
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
        'Access-Control-Allow-Credentials': 'true'
    });
};

module.exports = app;