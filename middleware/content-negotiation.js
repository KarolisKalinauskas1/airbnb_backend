/**
 * Improved content negotiation middleware
 * Ensures proper JSON responses for API requests
 */
function contentNegotiation(req, res, next) {
  // Check if this is an API request based on path or headers
  const isApiRequest = 
    req.path.startsWith('/api/') ||
    req.path.match(/^\/(camping-spots|users|bookings|dashboard|auth)\//) ||
    (req.headers.accept && req.headers.accept.includes('application/json'));
  
  if (isApiRequest) {
    // For API requests, ensure JSON
    const originalSend = res.send;
    res.send = function(body) {
      // If we're trying to send HTML but this is an API request
      if (typeof body === 'string' && body.includes('<!DOCTYPE html>')) {
        console.warn(`Prevented HTML response for API request: ${req.path}`);
        
        // Force JSON response
        res.setHeader('Content-Type', 'application/json');
        
        // Handle different status codes appropriately
        if (res.statusCode === 404) {
          return originalSend.call(this, JSON.stringify({ 
            error: 'Not Found',
            path: req.path,
            message: 'The requested resource was not found'
          }));
        } else {
          return originalSend.call(this, JSON.stringify({ 
            error: 'API Error',
            message: 'The API endpoint returned HTML instead of JSON',
            path: req.path
          }));
        }
      }
      
      // Make sure Content-Type is set for all API responses
      if (!res.get('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      
      return originalSend.apply(this, arguments);
    };
    
    // Also prevent redirects for API requests
    const originalRedirect = res.redirect;
    res.redirect = function(url) {
      console.warn(`Prevented redirect for API request: ${req.path} -> ${url}`);
      return res.status(200).json({ 
        redirectUrl: url,
        message: "API endpoints don't support redirects. This is the target URL."
      });
    };
  }
  
  next();
}

module.exports = contentNegotiation;
