const express = require('express');
const router = express.Router();
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { debug } = require('../utils/logger');

/* GET home page. */
router.get('/', function(req, res) {
  debug('Routes', 'Handling root request');
  
  // Check if the request wants JSON or HTML
  const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
  
  if (wantsJson) {
    return res.json({ status: 'ok', version: process.env.npm_package_version || '1.0.0' });
  }
  
  // Only redirect HTML requests, not API requests
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

/* Health check endpoint */
router.get('/health', function(req, res) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    acceptHeader: req.headers.accept
  });
});

/* GET dashboard redirects */
// Update these routes to avoid redirection and instead serve the SPA directly
router.get('/dashboard', function(req, res) {
  // If requesting JSON, forward to the API
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.redirect('/api/dashboard/analytics');
  }
  
  // Otherwise, serve the SPA
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

router.get('/dashboard/analytics', function(req, res) {
  // If requesting JSON, forward to the API
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.redirect('/api/dashboard/analytics');
  }
  
  // Otherwise, serve the SPA
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

router.get('/dashboard/spots', function(req, res) {
  // If requesting JSON, forward to the API
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.redirect('/api/dashboard/spots');
  }
  
  // Otherwise, serve the SPA
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
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
