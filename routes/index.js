const express = require('express');
const path = require('path');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Public endpoints moved to app.js for cleaner routing

/**
 * @route   GET /api
 * @desc    API information endpoint
 * @access  Public
 */
router.get('/api', (req, res) => {
  res.json({
    name: 'Airbnb for Camping API',
    version: '1.0.0',
    endpoints: [
      '/api/auth',
      '/api/camping-spots',
      '/api/camping-spots/amenities',
      '/api/camping-spots/countries',
      '/api/bookings',
      '/api/users',
      '/api/dashboard',
      '/api/health'
    ],
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /
 * @desc    Root endpoint, serves SPA or API info
 * @access  Public
 */
router.get('/', (req, res) => {
  // If client is requesting JSON, return API info
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({
      name: 'Airbnb for Camping API',
      message: 'Welcome to the Airbnb for Camping API',
      docs: '/api',
      status: 'online'
    });
  }
  
  // Otherwise serve the SPA
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// This should be the LAST route
router.get('*', function(req, res, next) {
  // Skip handling for API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Serve the SPA for all other routes
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = router;
