/**
 * Middleware to ensure proper API responses
 * Prevents HTML responses for API requests and adds helpful debug info
 */
function apiResponseHandler(req, res, next) {
  // Check if this is an API request
  const isApiRequest = req.path.startsWith('/api/') ||
                       req.headers.accept === 'application/json';
  
  if (isApiRequest) {
    // Override res.send to prevent HTML responses for API requests
    const originalSend = res.send;
    res.send = function(body) {
      // If we're about to send HTML but this is an API request
      if (typeof body === 'string' && body.trim().startsWith('<!DOCTYPE html>')) {
        console.warn(`Prevented HTML response for API request: ${req.path}`);
        return res.status(406).json({
          error: 'Not Acceptable',
          message: 'This API endpoint does not serve HTML content',
          path: req.path,
          requestedType: req.headers.accept || 'Not specified'
        });
      }
      
      // Otherwise, proceed normally
      return originalSend.apply(res, arguments);
    };
  }
  
  next();
}

module.exports = apiResponseHandler;
