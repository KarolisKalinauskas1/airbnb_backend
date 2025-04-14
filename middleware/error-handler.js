const { debug } = require('../utils/logger');

/**
 * Enhanced error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log detailed error information
  console.error('Error Details:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    headers: req.headers
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
  
  // Send response based on Accept header
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    // Browser request - redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/error?code=${statusCode}&message=${encodeURIComponent(err.message)}`);
  }
  
  // API request - return JSON error
  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;
