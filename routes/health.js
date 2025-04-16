const express = require('express');
const router = express.Router();

// Basic API health check endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    api: 'Airbnb for Camping API',
    headers: {
      contentType: res.getHeader('Content-Type'),
      accept: req.headers.accept
    }
  });
});

// Content type test endpoint
router.get('/content-type', (req, res) => {
  res.json({
    requestHeaders: {
      accept: req.headers.accept,
      contentType: req.headers['content-type']
    },
    responseHeaders: {
      contentType: res.getHeader('Content-Type')
    }
  });
});

module.exports = router;
