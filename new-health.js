const express = require('express');
const router = express.Router();
const { prisma } = require('../src/config/prisma');

// Basic health check endpoint
router.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Service temporarily unavailable',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

// Basic ping endpoint
router.get('/ping', (req, res) => {
  res.status(200).json({ status: 'pong' });
});

module.exports = router;
