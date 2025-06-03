const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const dashboardFeatures = require('../features/dashboard/routes');

// Use the features module routes
router.use('/', dashboardFeatures);

// Export the router
module.exports = router;