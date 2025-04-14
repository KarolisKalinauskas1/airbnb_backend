/**
 * Middleware to ensure proper content negotiation
 * Forces JSON responses for API endpoints and prevents HTML responses
 */
function enforceJsonForApi(req, res, next) {
  // Check if this is an API request (either by path or Accept header)
  const isApiRequest = req.path.startsWith('/api/') || 
                      (req.get('Accept') && req.get('Accept').includes('application/json'));
  
  if (isApiRequest) {
    // Force JSON for API requests
    const originalSend = res.send;
    
    // Override send method to ensure we're not sending HTML
    res.send = function(body) {
      // If we're about to send HTML but this is an API request
      if (typeof body === 'string' && body.trim().startsWith('<!DOCTYPE html>')) {
        console.warn('Attempted to send HTML for API request:', req.path);
        return res.status(406).json({
          error: 'Not Acceptable',
          message: 'API endpoint does not serve HTML content',
          path: req.path
        });
      }
      
      // Otherwise, proceed normally
      return originalSend.apply(res, arguments);
    };
  }
  
  next();
}

module.exports = { enforceJsonForApi };
