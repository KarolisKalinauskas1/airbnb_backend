const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({ 
    title: 'Airbnb for Camping API',
    status: 'running',
    version: '1.0.0'
  });
});

module.exports = router;
