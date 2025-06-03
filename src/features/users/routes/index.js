const express = require('express');
const router = express.Router();

// Import route handlers
const changePasswordRouter = require('./change-password');

// Mount routes
router.use('/change-password', changePasswordRouter);

module.exports = router;
