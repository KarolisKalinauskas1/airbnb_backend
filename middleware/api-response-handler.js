/**
 * Middleware to ensure proper API responses
 * Prevents HTML responses for API requests and adds helpful debug info
 */
function apiResponseHandler(req, res, next) {
  // Check if this is an API request based on path or Accept header
  const isApiRequest = 
    req.path.startsWith('/api/') || 
    req.path.startsWith('/camping-spots') || 
    req.path.startsWith('/users') || 
    req.path.startsWith('/dashboard') || 
    req.path.startsWith('/bookings') ||
    req.path.startsWith('/health') ||
    (req.headers.accept && 
      (req.headers.accept.includes('application/json') && 
       !req.headers.accept.includes('text/html')));
  
  if (isApiRequest) {
    // Set content type header for API requests ahead of time
    res.type('application/json');
    
    // Override res.send to prevent HTML responses
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
    
    // Also intercept render method to prevent template rendering for API
    const originalRender = res.render;
    res.render = function() {
      console.warn(`Prevented render for API request: ${req.path}`);
      return res.status(406).json({
        error: 'Not Acceptable',
        message: 'This API endpoint does not serve rendered views',
        path: req.path
      });
    };
  }
  
  next();
}

module.exports = apiResponseHandler;
