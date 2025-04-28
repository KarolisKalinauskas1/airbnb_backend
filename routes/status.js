const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { version } = require('../package.json');

/**
 * API status endpoint
 * Returns health and status information about the API and database
 */
router.get('/', async (req, res) => {
  const isDbConnected = db.isConnected;
  
  // Basic server information
  const status = {
    status: isDbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version,
    environment: process.env.NODE_ENV || 'development',
    databaseConnected: isDbConnected,
    offlineMode: db.offlineMode || false
  };
  
  // If database is connected, try to get more info
  if (isDbConnected) {
    try {
      // Try a simple database query to confirm connection
      await db.client.$queryRaw`SELECT 1 as connected`;
      status.databaseTest = 'passed';
    } catch (error) {
      status.databaseTest = 'failed';
      status.databaseError = error.message;
      status.databaseConnected = false;
      status.status = 'degraded';
    }
  } else if (db.lastError) {
    status.databaseError = db.lastError.message;
  }
  
  // Send the status with appropriate HTTP code
  res.status(isDbConnected ? 200 : 503).json(status);
});

/**
 * Simple ping endpoint
 * For quick health checks
 */
router.get('/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

module.exports = router;
