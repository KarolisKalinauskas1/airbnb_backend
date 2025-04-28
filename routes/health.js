const express = require('express');
const router = express.Router();

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
 * Simple health check endpoint that doesn't rely on database
 */
router.get('/', async (req, res) => {
  const now = Date.now();
  
  // Always return at least a basic health response
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: true
  });
});

/**
 * Detailed health check with database check
 */
router.get('/detailed', async (req, res) => {
  const now = Date.now();
  const timeSinceLastCheck = now - healthCache.lastCheck;
  
  // Check if we need to refresh the cache
  if (timeSinceLastCheck > MIN_CHECK_INTERVAL) {
    try {
      // Only try database check if module is available
      let dbConnected = false;
      
      try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        // Simple query to test database connectivity
        await prisma.$queryRaw`SELECT 1 as result`;
        await prisma.$disconnect();
        dbConnected = true;
      } catch (dbError) {
        console.warn('Health check database connection failed:', dbError.message);
        dbConnected = false;
      }
      
      // Update cache with successful result
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

// Add ping endpoint for simple connectivity checks
router.get('/ping', (req, res) => {
  res.json({ 
    pong: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
