const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds timeout
const prisma = new PrismaClient();

// Helper function to check database connection with timeout
const checkDatabaseConnection = async () => {
    return Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database connection timeout')), HEALTH_CHECK_TIMEOUT)
        )
    ]);
};

// Validate required environment variables
const validateEnvironment = () => {
    const required = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    return true;
};

// Basic health check
router.get('/', async (req, res) => {
    try {
        // Validate environment
        validateEnvironment();

        // Test database connection
        await checkDatabaseConnection();
        
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            database: 'connected',
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Health check failed:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: error.message.includes('timeout') ? 'timeout' : 'disconnected',
            error: error.message,
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime()
        });
    }
});

// Detailed health check with all services
router.get('/detailed', async (req, res) => {
    try {
        const healthStatus = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            services: {}
        };

        // Environment variables check
        try {
            validateEnvironment();
            healthStatus.services.environment = { status: 'ok' };
        } catch (envError) {
            healthStatus.services.environment = {
                status: 'error',
                error: envError.message
            };
            healthStatus.status = 'error';
        }

        // Database check
        try {
            await checkDatabaseConnection();
            healthStatus.services.database = { status: 'ok' };
        } catch (dbError) {
            healthStatus.services.database = { 
                status: 'error',
                error: dbError.message,
                type: dbError.message.includes('timeout') ? 'timeout' : 'connection_error'
            };
            healthStatus.status = 'error';
        }

        const statusCode = healthStatus.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(healthStatus);
    } catch (error) {
        console.error('Detailed health check failed:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message,
            environment: process.env.NODE_ENV || 'development'
        });
    }
});

module.exports = router;
