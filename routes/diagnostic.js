const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

/**
 * Diagnostic endpoint to check authentication
 */
router.get('/auth-check', (req, res) => {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(200).json({ 
      authenticated: false,
      reason: 'Missing or invalid Authorization header',
      header: authHeader ? 'Present but invalid' : 'Missing'
    });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(200).json({ 
      authenticated: false,
      reason: 'No token provided after Bearer',
      header: authHeader
    });
  }
  
  // Do basic token structure validation (without verification)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return res.status(200).json({ 
      authenticated: false,
      reason: 'Token does not have valid JWT structure',
      tokenFormat: 'Invalid'
    });
  }
  
  // Try to decode token payload for diagnostic info
  try {
    // Decode the payload (middle part)
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp && payload.exp < now;
    const expiresIn = payload.exp ? payload.exp - now : 'unknown';
    
    return res.status(200).json({
      tokenStructure: 'Valid',
      payload: {
        subject: payload.sub,
        issuer: payload.iss,
        issued_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : 'unknown',
        expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown',
        email: payload.email
      },
      tokenStatus: {
        expired: isExpired,
        expiresIn: isExpired ? 'Expired' : `${Math.round(expiresIn / 60)} minutes`,
        now: new Date(now * 1000).toISOString()
      }
    });
  } catch (error) {
    return res.status(200).json({ 
      authenticated: false,
      reason: 'Token could not be decoded',
      error: error.message,
      token: token.substring(0, 10) + '...'
    });
  }
});

/**
 * Protected endpoint that requires authentication
 */
router.get('/protected', authenticate, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id: req.supabaseUser.id,
      email: req.supabaseUser.email
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
