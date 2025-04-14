/**
 * Middleware to ensure CORS headers are properly set for all responses
 */
const ensureCorsHeaders = (req, res, next) => {
  // These headers are already set by the cors package, but we're making sure they're present
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Get origin from request
  const origin = req.headers.origin;
  if (origin) {
    // Allow the specific origin that made the request
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  next();
};

module.exports = ensureCorsHeaders;
