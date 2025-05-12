/**
 * Consolidated Authentication Module
 * 
 * This module combines functionality from:
 * - routes/auth.js
 * - routes/auth-lite.js
 * - routes/auth-simple.js
 * - routes/auth-debug.js
 */

const express = require('express');
const router = express.Router();

// Import auth components
const mainAuthRoutes = require('./components/main');
const liteAuthRoutes = require('./components/lite');
const debugAuthRoutes = require('./components/debug');

// Main auth routes (all standard auth functionality)
router.use('/', mainAuthRoutes);

// Lite auth routes (for minimal/performance-optimized authentication)
router.use('/lite', liteAuthRoutes);

// Debug routes (only in development)
if (process.env.NODE_ENV !== 'production') {
  router.use('/debug', debugAuthRoutes);
}

module.exports = router;