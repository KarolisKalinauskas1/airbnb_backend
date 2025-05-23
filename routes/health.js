const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

// Health check state tracking
const healthState = {
    isDbConnected: false,
    lastSuccessfulCheck: null,
    connectionAttempts: 0,
    lastConnectionAttempt: null,
    startupTime: Date.now()
};

// Create Prisma client with connection pool
const prisma = new PrismaClient({
    log: ['error'],
    errorFormat: 'minimal',
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    connection: {
        pool: {
            min: 2,
            max: 10
        }
    }
});

// Constants
const STARTUP_GRACE_PERIOD = 60; // 60 seconds
const DB_TIMEOUT = 5000; // 5 seconds
const DB_CHECK_INTERVAL = 10000; // 10 seconds
const MIN_CHECK_INTERVAL = 1000; // 1 second minimum between checks

// Basic ping endpoint (no database required)
router.get('/ping', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Monitor database connection state
async function checkDatabaseConnection() {
    try {
        await Promise.race([
            prisma.$queryRaw`SELECT 1`,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT))
        ]);
        healthState.isDbConnected = true;
        healthState.lastSuccessfulCheck = Date.now();
        healthState.connectionAttempts = 0;
        return true;
    } catch (error) {
        healthState.isDbConnected = false;
        console.warn('Database connection check failed:', error.message);
        return false;
    }
}

// Start periodic connection monitoring
setInterval(checkDatabaseConnection, DB_CHECK_INTERVAL);

// Main health check endpoint
router.get('/', async (req, res) => {
    const now = Date.now();
    console.log('Health check called at', new Date(now).toISOString());

    // During startup grace period, always return 200
    if ((now - healthState.startupTime) < (STARTUP_GRACE_PERIOD * 1000)) {
        return res.json({ 
            status: 'starting',
            uptime: process.uptime(),
            startupTime: Math.round((now - healthState.startupTime) / 1000),
            message: 'Service is starting up'
        });
    }

    // If we've checked recently and succeeded, return that status
    if (healthState.lastSuccessfulCheck && 
        (now - healthState.lastSuccessfulCheck) < DB_CHECK_INTERVAL) {
        return res.json({
            status: 'ok',
            uptime: process.uptime(),
            lastCheck: new Date(healthState.lastSuccessfulCheck).toISOString()
        });
    }

    // Prevent too frequent checks
    if (healthState.lastConnectionAttempt && 
        (now - healthState.lastConnectionAttempt) < MIN_CHECK_INTERVAL) {
        return res.status(429).json({
            status: 'error',
            message: 'Too many health check attempts',
            retryAfter: 1
        });
    }

    // Perform fresh database check
    healthState.lastConnectionAttempt = now;
    const isConnected = await checkDatabaseConnection();

    if (isConnected) {
        return res.json({
            status: 'ok',
            uptime: process.uptime(),
            lastCheck: new Date(healthState.lastSuccessfulCheck).toISOString()
        });
    }

    // Handle database connection failure
    healthState.connectionAttempts++;
    
    // If we had a successful check in the last 5 minutes, return degraded
    const recentSuccess = healthState.lastSuccessfulCheck && 
        (now - healthState.lastSuccessfulCheck) < 300000;

    if (recentSuccess) {
        return res.status(200).json({
            status: 'degraded',
            message: 'Service experiencing intermittent database connectivity',
            uptime: process.uptime(),
            lastSuccessfulCheck: new Date(healthState.lastSuccessfulCheck).toISOString(),
            retryAfter: 5
        });
    }

    // Otherwise return service unavailable
    return res.status(503).json({
        status: 'error',
        message: 'Service temporarily unavailable',
        uptime: process.uptime(),
        attempts: healthState.connectionAttempts,
        retryAfter: 10,
        nextCheck: new Date(now + 10000).toISOString()
    });
});
const { PrismaClient } = require('@prisma/client');

// Health check state tracking
const healthState = {
    isDbConnected: false,
    lastSuccessfulCheck: null,
    connectionAttempts: 0,
    lastConnectionAttempt: null,
    startupTime: Date.now()
};

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

// Monitor database connection state
let dbCheckInterval;
async function monitorDatabaseConnection() {
    if (dbCheckInterval) return; // Prevent multiple intervals

    dbCheckInterval = setInterval(async () => {
        try {
            await prisma.$queryRaw`SELECT 1`;
            healthState.isDbConnected = true;
            healthState.lastSuccessfulCheck = Date.now();
            healthState.connectionAttempts = 0;
        } catch (error) {
            healthState.isDbConnected = false;
            console.warn('Database connection check failed:', error.message);
        }
    }, 10000); // Check every 10 seconds
}

// Start monitoring
monitorDatabaseConnection();

const STARTUP_GRACE_PERIOD = 60; // 60 seconds startup grace period
const DB_TIMEOUT = 5000; // 5 second timeout
const DB_CHECK_INTERVAL = 10000; // 10 seconds between checks
const MAX_RETRIES = 3;

// Basic availability check endpoint (no database)
router.get('/ping', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Basic health check that Railway uses
router.get('/', async (req, res) => {
    console.log('Health check endpoint called at', new Date().toISOString());
    
    try {
        // During startup grace period, always return 200
        if ((Date.now() - healthState.startupTime) < (STARTUP_GRACE_PERIOD * 1000)) {
            console.log('Service still starting up, returning 200');
            return res.json({ 
                status: 'starting',
                uptime: process.uptime(),
                startupTime: Math.round((Date.now() - healthState.startupTime) / 1000),
                message: 'Service is starting up'
            });
        }

        // If we have a recent successful check, use that status
        if (healthState.lastSuccessfulCheck && 
            (Date.now() - healthState.lastSuccessfulCheck) < DB_CHECK_INTERVAL) {
            return res.json({
                status: 'ok',
                uptime: process.uptime(),
                lastCheck: new Date(healthState.lastSuccessfulCheck).toISOString()
            });
        }        // Prevent too frequent connection attempts
        if (healthState.lastConnectionAttempt && 
            (Date.now() - healthState.lastConnectionAttempt) < 1000) { // 1 second minimum between attempts
            return res.status(503).json({
                status: 'error',
                message: 'Too many health check attempts',
                retryAfter: 1
            });
        }

        // Check database connection state
        healthState.lastConnectionAttempt = Date.now();
        
        try {
            const dbCheck = await Promise.race([
                prisma.$executeRaw`SELECT 1`,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Database connection timeout')), DB_TIMEOUT)
                )
            ]);

            // Update health state on success
            healthState.isDbConnected = true;
            healthState.lastSuccessfulCheck = Date.now();
            healthState.connectionAttempts = 0;
            
            return res.json({ 
                status: 'ok',
                uptime: process.uptime(),
                lastCheck: new Date(healthState.lastSuccessfulCheck).toISOString()
            });
        } catch (error) {
            healthState.isDbConnected = false;
            healthState.connectionAttempts++;
            
            // Log detailed error information
            console.error('Database health check failed:', {
                error: error.message,
                attempts: healthState.connectionAttempts,
                lastSuccess: healthState.lastSuccessfulCheck ? 
                    new Date(healthState.lastSuccessfulCheck).toISOString() : 'never'
            });
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
