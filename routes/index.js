const express = require('express');
const router = express.Router();
const path = require('path'); // Add this import for the path module
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/* GET home page. */
router.get('/', function(req, res, next) {
  // If requesting JSON, return API info
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ 
      title: 'Airbnb for Camping API',
      status: 'running',
      version: '1.0.0'
    });
  }
  
  // For HTML requests, serve the SPA
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for CORS
router.options('/cors-test', (req, res) => {
  res.status(200).send('Preflight request successful');
});

router.get('/cors-test', (req, res) => {
  res.status(200).json({ 
    message: 'CORS test successful',
    headers: {
      'access-control-allow-credentials': res.getHeader('Access-Control-Allow-Credentials'),
      'access-control-allow-origin': res.getHeader('Access-Control-Allow-Origin')
    },
    origin: req.headers.origin || 'No origin header'
  });
});

// Add a database health check endpoint
router.get('/db-check', async (req, res) => {
  try {
    // Perform a simple database query to check connection
    const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM public_users`;
    res.status(200).json({ 
      status: 'ok', 
      message: 'Database connection successful',
      data: count
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Add a catch-all route for SPA navigation that EXCLUDES API paths
router.get('*', (req, res, next) => {
  // Skip handling for API and other specific routes
  if (req.path.startsWith('/api') || 
      req.path.startsWith('/camping-spots') || 
      req.path.startsWith('/users') || 
      req.path.startsWith('/auth') ||
      req.path.startsWith('/bookings') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/dashboard') ||
      req.path.startsWith('/webhooks')) {
    return next();
  }
  
  // Serve the SPA for all other routes
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = router;
