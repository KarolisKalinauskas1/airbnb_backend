/**
 * Middleware to log request details for debugging purposes
 */
const requestLogger = (req, res, next) => {
  // Only log in debug mode
  if (process.env.DEBUG_MODE === 'true') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    
    if (Object.keys(req.query).length > 0) {
      console.log('Query params:', req.query);
    }
    
    if (req.body && Object.keys(req.body).length > 0 && 
        req.headers['content-type']?.includes('application/json')) {
      console.log('Body:', JSON.stringify(req.body, null, 2).substring(0, 200) + '...');
    }
  }
  
  // Continue with the standard request flow
  next();
};

module.exports = requestLogger;
