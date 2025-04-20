const { debug } = require('../utils/logger');

/**
 * Enhanced error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // If headers already sent, delegate to Express default error handler
  if (res.headersSent) {
    return next(err);
  }

  // Log detailed error information
  console.error('Error Details:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });
  
  // Set status code
  const statusCode = err.status || 500;
  
  // Create response object
  const errorResponse = {
    error: err.message || 'An unexpected error occurred',
    status: statusCode,
    timestamp: new Date().toISOString()
  };
  
  // Add stack trace in development mode
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || '';
  }
  
  // Add request path
  errorResponse.path = req.originalUrl;
  
  // Determine response format based on Accept header and request path
  const isApiRequest = req.path.startsWith('/api/') || 
                       (req.headers.accept && req.headers.accept.includes('application/json'));
  
  if (isApiRequest) {
    // Always send JSON for API requests
    res.status(statusCode).json(errorResponse);
  } else if (req.headers.accept && req.headers.accept.includes('text/html')) {
    // Browser request - redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/error?code=${statusCode}&message=${encodeURIComponent(err.message)}`);
  } else {
    // Default to JSON
    res.status(statusCode).json(errorResponse);
  }
};

module.exports = errorHandler;
