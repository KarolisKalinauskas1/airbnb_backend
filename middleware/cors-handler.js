/**
 * Enhanced CORS handling middleware
 * This ensures proper CORS headers are set for all responses
 */
function corsHandler(req, res, next) {
  // Set CORS headers for all responses
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Add CORS headers to error responses as well
  const originalEnd = res.end;
  res.end = function() {
    if (res.statusCode >= 400) {
      res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:5173');
    }
    return originalEnd.apply(this, arguments);
  };
  
  next();
}

module.exports = corsHandler;
