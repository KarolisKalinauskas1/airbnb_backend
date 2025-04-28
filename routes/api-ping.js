/**
 * Simple API ping route for health checks
 */
const express = require('express');
const router = express.Router();

// Basic ping endpoint that always responds with 200 OK
router.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'API is reachable'
  });
});

// Health check endpoint with more details
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    memory: process.memoryUsage()
  });
});

module.exports = router;
