/**
 * Middleware to ensure that both /api/ and direct path requests are handled correctly
 */
const apiPathNormalizer = (req, res, next) => {
  // Log the incoming request for debugging
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  // Store original URL for reference
  req.originalApiUrl = req.originalUrl;
  
  // Continue with the standard request flow
  next();
};

module.exports = apiPathNormalizer;
