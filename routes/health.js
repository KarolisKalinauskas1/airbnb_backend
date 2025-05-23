const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

// Create Prisma client with connection pool
const prisma = new PrismaClient({
    log: ['error'],
    errorFormat: 'minimal',
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    // Add connection pooling
    connection: {
        pool: {
            min: 2,
            max: 10
        }
    }
});

// Track connection attempts and failures
let connectionAttempts = 0;
let lastConnected = Date.now();
const MAX_RETRIES = 3;
const STARTUP_GRACE_PERIOD = 60; // 60 seconds startup grace period
const DB_TIMEOUT = 10000; // 10 second timeout

// Basic health check that Railway uses
router.get('/', async (req, res) => {
    console.log('Health check endpoint called at', new Date().toISOString());
    
    try {
        // During startup grace period, always return 200
        if (process.uptime() < STARTUP_GRACE_PERIOD) {
            console.log('Service still starting up, returning 200');
            return res.json({ 
                status: 'starting',
                uptime: process.uptime(),
                message: 'Service is starting up'
            });
        }

        // Add timeout to the database check with retries
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const dbCheck = Promise.race([
                    prisma.$executeRaw`SELECT 1`,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Database connection timeout')), DB_TIMEOUT)
                    )
                ]);

                await dbCheck;
                
                // Reset connection metrics on success
                connectionAttempts = 0;
                lastConnected = Date.now();
                console.log('Health check passed at', new Date().toISOString());
                
                return res.json({ 
                    status: 'ok',
                    uptime: process.uptime()
                });
            } catch (retryError) {
                console.warn(`Database check attempt ${attempt}/${MAX_RETRIES} failed:`, retryError.message);
                if (attempt === MAX_RETRIES) throw retryError;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between retries
            }
        }
    } catch (error) {
        console.error('Health check failed:', {
            error: error.message,
            timestamp: new Date().toISOString(),
            type: error.name,
            code: error.code,
            attempts: connectionAttempts + 1,
            timeSinceLastSuccess: Date.now() - lastConnected
        });

        connectionAttempts++;

        // If we've had recent successful connections, return 200 degraded instead of 503
        const recentlyConnected = (Date.now() - lastConnected) < 300000; // 5 minutes
        if (recentlyConnected) {
            return res.status(200).json({
                status: 'degraded',
                message: 'Service experiencing intermittent database connectivity',
                uptime: process.uptime(),
                retryAfter: 5
            });
        }

        // Railway expects a 503 for service unavailable
        res.status(503).json({ 
            status: 'error',
            message: 'Service temporarily unavailable',
            retryAfter: 10,
            nextAttempt: new Date(Date.now() + 10000).toISOString()
        });
    }
});

// Detailed health check for diagnostics
router.get('/detailed', async (req, res) => {
    const healthInfo = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        database: 'checking',
        memory: process.memoryUsage(),
        uptime: process.uptime()
    };

    try {
        const dbResult = await Promise.race([
            prisma.$queryRaw`SELECT 1 as connected`,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database timeout')), 5000)
            )
        ]);
        
        healthInfo.database = 'connected';
    } catch (error) {
        healthInfo.status = 'error';
        healthInfo.database = 'error';
        healthInfo.error = {
            message: error.message,
            type: error.message.includes('timeout') ? 'timeout' : 'connection_error'
        };
    }

    const statusCode = healthInfo.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthInfo);
});

// Keep the connection alive with exponential backoff
let isConnected = false;
let reconnectAttempt = 0;
const MAX_RECONNECT_INTERVAL = 30000; // 30 seconds max
const MIN_RECONNECT_INTERVAL = 1000;  // 1 second min

const maintainConnection = async () => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        if (!isConnected) {
            console.log('Database connection restored at', new Date().toISOString());
        }
        isConnected = true;
        reconnectAttempt = 0;
        scheduleNextCheck(MIN_RECONNECT_INTERVAL);
    } catch (error) {
        isConnected = false;
        reconnectAttempt++;
        console.error('Database connection check failed:', error.message);
        
        // Calculate next interval with exponential backoff
        const nextInterval = Math.min(
            MIN_RECONNECT_INTERVAL * Math.pow(2, reconnectAttempt),
            MAX_RECONNECT_INTERVAL
        );
        scheduleNextCheck(nextInterval);
    }
};

// Schedule next connection check with dynamic interval
let nextCheckTimeout;
const scheduleNextCheck = (interval) => {
    if (nextCheckTimeout) {
        clearTimeout(nextCheckTimeout);
    }
    nextCheckTimeout = setTimeout(maintainConnection, interval);
};

// Start the initial connection maintenance
maintainConnection().catch(console.error);

module.exports = router;
