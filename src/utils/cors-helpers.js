/**
 * CORS helper utilities
 */

/**
 * Apply emergency CORS headers to handle options preflight
 */
const applyEmergencyCorsHeaders = (req, res, next) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    return res.status(204).end();
  }
  next();
};

/**
 * Log CORS debug info for troubleshooting
 */
const logCorsDebugInfo = (req) => {
  console.log('CORS Debug Info:', {
    origin: req.headers.origin,
    method: req.method,
    path: req.path,
    headers: {
      'access-control-request-method': req.headers['access-control-request-method'],
      'access-control-request-headers': req.headers['access-control-request-headers'],
      'origin': req.headers.origin
    }
  });
};

module.exports = {
  applyEmergencyCorsHeaders,
  logCorsDebugInfo
};
