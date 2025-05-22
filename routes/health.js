const express = require('express');
const router = express.Router();
const ServiceHealthCheck = require('../src/utils/service-health');

// Basic health check
router.get('/', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Detailed health check with all services
router.get('/detailed', async (req, res) => {
    try {
        const healthStatus = await ServiceHealthCheck.checkAllServices();
        const statusCode = healthStatus.healthy ? 200 : 503;
        res.status(statusCode).json(healthStatus);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

module.exports = router;
