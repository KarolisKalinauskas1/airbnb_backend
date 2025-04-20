/**
 * Database connection check middleware
 * Used to check if database is connected before processing API requests
 */

const db = require('../config/database');

/**
 * List of paths that should be accessible even when the database is down
 */
const ALWAYS_ACCESSIBLE_PATHS = [
  // Static file extensions
  /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i,
  
  // Health endpoints
  '/health',
  '/api/health',
  
  // Auth endpoints - needed for login to work even if DB is down
  '/api/auth/test',
  '/api/auth/signin',
  '/api/auth/login',
  '/api/auth/status',
  
  // Public API endpoints that don't require database access
  '/api/status',
  '/api/version',
  '/api/diagnostics',
  '/api/diagnostics/network'
];

/**
 * Middleware to check database connection before processing API requests
 */
async function dbConnectionCheck(req, res, next) {
  // Skip connection check for paths that should always be accessible
  for (const path of ALWAYS_ACCESSIBLE_PATHS) {
    if (typeof path === 'string' && (req.path === path || req.path.startsWith(`${path}/`))) {
      return next();
    } else if (path instanceof RegExp && path.test(req.path)) {
      return next();
    }
  }

  // Skip check if we're in offline mode
  if (db.offlineMode) {
    return next();
  }

  // If we already know the database is connected, proceed
  if (db.isConnected) {
    return next();
  }
  
  // Try a quick connection check with a short timeout
  try {
    const connected = await Promise.race([
      db.testConnection(),
      new Promise((_, reject) => setTimeout(() => 
        reject(new Error('Connection check timed out')), 1000))
    ]);
    
    if (connected) {
      return next();
    }
    
    // If we get here, test connection reported not connected
    return res.status(503).json({
      error: 'Database service unavailable',
      message: 'The database is currently unreachable. Please try again later.',
      status: 'disconnected',
      timestamp: new Date().toISOString(),
      retryAfter: 30
    });
  } catch (error) {
    // Connection check timed out or failed with error
    console.warn(`Database connection check for ${req.path} failed:`, error.message);
    
    return res.status(503).json({
      error: 'Database service unavailable',
      message: 'The database is currently not responding. Please try again later.',
      status: 'error',
      timestamp: new Date().toISOString(),
      retryAfter: 30
    });
  }
}

module.exports = dbConnectionCheck;
