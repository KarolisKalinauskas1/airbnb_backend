/**
 * Content Type Middleware
 * Ensures proper content type headers for API responses
 */
function contentTypeMiddleware(req, res, next) {
  // Check if this is an API request
  const isApiRequest = req.path.startsWith('/api/') || 
                       req.path.startsWith('/camping-spots') ||
                       req.path.startsWith('/users') ||
                       req.path.startsWith('/dashboard') ||
                       req.path.startsWith('/bookings') ||
                       req.headers.accept === 'application/json';

  if (isApiRequest) {
    // Save the original send method
    const originalSend = res.send;
    
    // Override res.send to enforce JSON content type
    res.send = function(body) {
      // Set JSON content type
      this.set('Content-Type', 'application/json');
      
      // If we're sending HTML for an API request, convert to a JSON error
      if (typeof body === 'string' && body.trim().startsWith('<!DOCTYPE html>')) {
        console.error('Prevented HTML response for API request:', req.path);
        return res.status(406).json({
          error: 'Not Acceptable',
          message: 'API endpoints do not serve HTML content'
        });
      }
      
      // Call the original send method
      return originalSend.apply(this, arguments);
    };
  }
  
  next();
}

module.exports = contentTypeMiddleware;
