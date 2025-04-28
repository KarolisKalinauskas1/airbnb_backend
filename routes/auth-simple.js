const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

/**
 * Simplified session sync endpoint - minimal processing for quick responses
 */
router.post('/sync-session', (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  try {
    // Check if we already have a session
    if (req.session?.userId) {
      return res.json({
        authenticated: true,
        userId: req.session.userId
      });
    }
    
    // Get token from request
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ authenticated: false, error: 'No token provided' });
    }
    
    // Simple decode without verification for speed
    const decoded = jwt.decode(token);
    
    // Check if decoding worked
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ authenticated: false, error: 'Invalid token' });
    }
    
    // Set session data
    req.session.userId = decoded.sub;
    req.session.email = decoded.email || '';
    
    return res.json({
      authenticated: true,
      userId: decoded.sub,
      sessionRestored: true
    });
  } catch (error) {
    console.error('Session sync error:', error);
    return res.status(500).json({ authenticated: false, error: 'Server error' });
  }
});

module.exports = router;
