/**
 * Content negotiation middleware
 * This ensures proper content type handling for both browser and API requests
 */
module.exports = function(req, res, next) {
  // Skip for static files
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i)) {
    return next();
  }

  // Original request accepts header
  const accepts = req.headers.accept || '';
  
  // Check if this is an API request based on path and headers
  const isApiRequest = 
    req.path.startsWith('/api/') || 
    req.path.startsWith('/camping-spots') ||
    req.path.startsWith('/users') || 
    req.path.startsWith('/bookings') ||
    req.path.startsWith('/dashboard') ||
    accepts.includes('application/json');
  
  if (isApiRequest) {
    // For API requests, always respond with JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Store original functions
    const originalSend = res.send;
    const originalJson = res.json;
    const originalRender = res.render;
    
    // Override send to ensure JSON content
    res.send = function(body) {
      if (typeof body === 'string' && body.startsWith('<!DOCTYPE html>')) {
        // If we're trying to send HTML for an API request, send JSON error instead
        return res.status(406).json({
          error: 'Not Acceptable',
          message: 'This endpoint requires Accept: application/json header',
          path: req.path
        });
      }
      return originalSend.call(this, body);
    };
    
    // Override render to prevent template rendering
    res.render = function() {
      return res.status(406).json({
        error: 'Not Acceptable',
        message: 'This endpoint does not support HTML rendering',
        path: req.path
      });
    };
  }
  
  next();
};
