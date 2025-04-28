const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

/**
 * Lightweight session sync endpoint
 * This endpoint is designed to be extremely fast with minimal processing
 * It doesn't do full token validation, just verifies format
 */
router.post('/sync-session', (req, res) => {
  // Apply CORS headers for credential requests
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  
  try {
    // Check if session already exists
    if (req.session && req.session.userId) {
      return res.json({
        authenticated: true,
        userId: req.session.userId,
        email: req.session.email,
        isowner: Number(req.session.isowner) || 0
      });
    }
    
    // Get token from request body
    const { token } = req.body;
    
    if (!token) {
      return res.status(200).json({ 
        authenticated: false,
        error: 'Missing token' 
      });
    }
    
    // Just check if token looks like a JWT without full verification
    // This is much faster than validating signatures
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      return res.status(200).json({ 
        authenticated: false,
        error: 'Invalid token format' 
      });
    }
    
    try {
      // Just decode the token
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.sub) {
        return res.status(200).json({ 
          authenticated: false,
          error: 'Invalid token content' 
        });
      }
      
      // Set minimal session data
      req.session.userId = decoded.sub;
      req.session.email = decoded.email || '';
      
      return res.json({
        authenticated: true,
        userId: decoded.sub,
        sessionRestored: true
      });
    } catch (tokenError) {
      return res.status(200).json({
        authenticated: false, 
        error: 'Token decode error'
      });
    }
  } catch (error) {
    return res.status(200).json({
      authenticated: false,
      error: 'Session sync error'
    });
  }
});

module.exports = router;
