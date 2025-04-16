/**
 * Content Negotiation Middleware
 * Ensures proper content types for API requests
 */
function contentNegotiation(req, res, next) {
  // Check if this is an API request or JSON request
  const isApiRequest = req.path.startsWith('/api/') || 
                       (req.headers.accept && req.headers.accept.includes('application/json'));

  // Check if this is a dashboard route that should be handled by the SPA
  const isDashboardRoute = req.path.startsWith('/dashboard/') || req.path === '/dashboard';
  
  // Allow redirects for dashboard routes even if they look like API endpoints
  if (isDashboardRoute && !req.path.startsWith('/api/dashboard')) {
    return next();
  }

  if (isApiRequest) {
    // Set response type to JSON before any handlers run
    res.setHeader('Content-Type', 'application/json');
    
    // Save original methods that might cause issues
    const originalSend = res.send;
    const originalJson = res.json;
    const originalRedirect = res.redirect;
    const originalRender = res.render;
    
    // Override res.send to enforce JSON for API routes
    res.send = function(body) {
      // If we're sending HTML but this is an API request, convert to JSON error
      if (typeof body === 'string' && body.trim().startsWith('<!DOCTYPE html')) {
        console.error('Prevented HTML response for API request:', req.path);
        return res.status(406).json({
          error: 'Not Acceptable',
          message: 'This API endpoint does not serve HTML content',
          path: req.path
        });
      }
      
      // Ensure content type is set for every response
      this.setHeader('Content-Type', 'application/json');
      
      // Call the original send method
      return originalSend.apply(this, arguments);
    };
    
    // Override res.json to ensure content type
    res.json = function(body) {
      this.setHeader('Content-Type', 'application/json');
      return originalJson.apply(this, arguments);
    };
    
    // Prevent redirects for API requests
    res.redirect = function() {
      console.error(`Prevented redirect for API request: ${req.path} -> ${arguments[0]}`);
      return res.status(406).json({
        error: 'Not Acceptable',
        message: 'This API endpoint does not support redirects',
        path: req.path,
        redirectTarget: arguments[0]
      });
    };
    
    // Prevent template rendering for API requests
    res.render = function() {
      console.error(`Prevented template rendering for API request: ${req.path}`);
      return res.status(406).json({
        error: 'Not Acceptable',
        message: 'This API endpoint does not support HTML templates',
        path: req.path
      });
    };
  }
  
  next();
}

module.exports = contentNegotiation;
