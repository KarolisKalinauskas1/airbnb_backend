const express = require('express');
const router = express.Router();
// Forward all camping-spot routes to feature router
const featureRoutes = require('../src/features/camping/routes');

// Mount the feature routes
router.use('/', featureRoutes);

module.exports = router;