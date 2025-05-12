/**
 * Consolidated Health and Diagnostics Module
 * 
 * This module consolidates functionality from:
 * - routes/health.js
 * - routes/status.js
 * - routes/diagnostic.js
 * - routes/diagnostics.js
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { version } = require('../../package.json'); 

// Cache health check results to reduce database load
let healthCache = {
  status: 'ok',
  timestamp: new Date().toISOString(),
  dbConnected: false,
  lastCheck: 0
};

// Only check database every 30 seconds at most
const MIN_CHECK_INTERVAL = 30000;

/**
 * @route   GET /health
 * @desc    Basic health check endpoint that doesn't rely on database
 * @access  Public
 */
router.get('/', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: true
  });
});

/**
 * @route   GET /health/detailed
 * @desc    Detailed health check with database connectivity test
 * @access  Public
 */
router.get('/detailed', async (req, res) => {
  const now = Date.now();
  const timeSinceLastCheck = now - healthCache.lastCheck;
  
  // Check if we need to refresh the cache
  if (timeSinceLastCheck > MIN_CHECK_INTERVAL) {
    try {
      // Test database connectivity
      let dbConnected = false;
      
      try {
        // Simple query to test database connectivity
        await prisma.$queryRaw`SELECT 1 as result`;
        dbConnected = true;
      } catch (dbError) {
        console.warn('Health check database connection failed:', dbError.message);
        dbConnected = false;
      }
      
      // Update cache with result
      healthCache = {
        status: dbConnected ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        dbConnected,
        lastCheck: now
      };
    } catch (error) {
      console.warn('Health check error:', error.message);
      
      // Update cache with error result
      healthCache = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        dbConnected: false,
        lastCheck: now,
        error: 'System error'
      };
    }
  }
  
  // Always return the cached result
  res.json(healthCache);
});

/**
 * @route   GET /health/ping
 * @desc    Simple ping endpoint for quick connectivity checks
 * @access  Public
 */
router.get('/ping', (req, res) => {
  res.json({ 
    pong: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /health/status
 * @desc    API status endpoint with more detailed information
 * @access  Public
 */
router.get('/status', async (req, res) => {
  const isDbConnected = healthCache.dbConnected;
  
  // Basic server information
  const status = {
    status: isDbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version,
    environment: process.env.NODE_ENV || 'development',
    databaseConnected: isDbConnected
  };
  
  // Send the status with appropriate HTTP code
  res.status(isDbConnected ? 200 : 503).json(status);
});

/**
 * @route   GET /health/diagnostics
 * @desc    Advanced diagnostics for troubleshooting
 * @access  Public
 */
router.get('/diagnostics', async (req, res) => {
  try {
    // Check environment and configuration
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY),
      hasDatabaseUrl: !!process.env.DATABASE_URL
    };

    // Check database connection
    let dbStatus = { connected: false };
    try {
      // Try a simple query
      await prisma.$queryRaw`SELECT 1 as result`;
      dbStatus.connected = true;
    } catch (error) {
      dbStatus.error = error.message;
    }
    
    // Return diagnostic info
    res.json({
      timestamp: new Date().toISOString(),
      environment: envInfo,
      database: dbStatus,
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /health/content-type-test
 * @desc    Test JSON content negotiation
 * @access  Public
 */
router.get('/content-type-test', (req, res) => {
  res.json({
    success: true,
    message: 'Content negotiation is working correctly',
    responseHeaders: {
      'content-type': res.getHeader('Content-Type')
    }
  });
});

// Export the consolidated router
module.exports = router;