const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: ['error'],
    errorFormat: 'minimal'
});

// Basic health check that Railway uses
router.get('/', async (req, res) => {
    console.log('Health check endpoint called at', new Date().toISOString());
    
    try {
        // Simple check without database to ensure the app is at least running
        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Health check failed:', {
            error: error.message,
            timestamp: new Date().toISOString()
        });

        // Railway expects a 503 for service unavailable
        res.status(503).json({ status: 'error' });
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

// Keep the connection alive
let isConnected = false;
const maintainConnection = async () => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        isConnected = true;
    } catch (error) {
        isConnected = false;
        console.error('Database connection check failed:', error.message);
    }
};

// Run the connection check every 30 seconds
setInterval(maintainConnection, 30000);
maintainConnection().catch(console.error);

module.exports = router;
