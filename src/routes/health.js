const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Ping endpoint
router.get('/ping', (req, res) => {
  res.status(200).json({ message: 'pong' });
});

module.exports = router; 