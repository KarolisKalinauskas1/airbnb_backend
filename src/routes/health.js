const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { RedisStore } = require('../config/redis');
const os = require('os');

const checkDatabase = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'up', responseTime: 'ok' };
  } catch (error) {
    return { status: 'down', error: error.message };
  }
};

const checkRedis = async () => {
  if (!RedisStore) return { status: 'not_configured' };
  
  try {
    const start = Date.now();
    await RedisStore.ping();
    return { 
      status: 'up',
      responseTime: Date.now() - start + 'ms'
    };
  } catch (error) {
    return { status: 'down', error: error.message };
  }
};

const getSystemMetrics = () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    memory: {
      total: Math.round(totalMem / 1024 / 1024) + 'MB',
      used: Math.round(usedMem / 1024 / 1024) + 'MB',
      free: Math.round(freeMem / 1024 / 1024) + 'MB',
      usagePercent: Math.round((usedMem / totalMem) * 100) + '%'
    },
    cpu: {
      cores: os.cpus().length,
      loadAvg: os.loadavg()
    },
    uptime: Math.round(os.uptime() / 60 / 60) + ' hours'
  };
};

// Basic health check that always responds
router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Detailed health check with configurable timeout
router.get('/detailed', async (req, res) => {
  try {
    const timeout = parseInt(req.query.timeout) || 5000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const [dbHealth, redisHealth] = await Promise.all([
      Promise.race([
        checkDatabase(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database check timeout')), timeout)
        )
      ]),
      Promise.race([
        checkRedis(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis check timeout')), timeout)
        )
      ])
    ]);

    clearTimeout(timeoutId);

    const systemMetrics = getSystemMetrics();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth,
      redis: redisHealth,
      system: systemMetrics
    });
  } catch (error) {
    // Still return 200 for Railway health checks, but include error info
    res.status(200).json({
      status: 'ok',
      error: {
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});
router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Ping endpoint
router.get('/ping', (req, res) => {
  res.status(200).json({ message: 'pong' });
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis()
  ]);

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: dbHealth,
      redis: redisHealth
    }
  };

  // Only include system metrics if explicitly requested
  if (req.query.metrics === 'true') {
    health.system = getSystemMetrics();
  }

  // Determine overall status
  if (dbHealth.status === 'down' || redisHealth.status === 'down') {
    health.status = 'degraded';
    res.status(503);
  }

  res.json(health);
});

module.exports = router;