/**
 * Middleware to ensure proper content type headers for API responses
 */
function contentTypeMiddleware(req, res, next) {
  // Save the original res.json method
  const originalJson = res.json;
  
  // Override the json method to set proper content type
  res.json = function(data) {
    // Always set the proper content type for API responses
    res.setHeader('Content-Type', 'application/json');
    
    // Call the original json method
    return originalJson.call(this, data);
  };
  
  next();
}

module.exports = contentTypeMiddleware;
