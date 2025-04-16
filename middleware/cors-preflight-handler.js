/**
 * CORS Preflight Handler
 * Ensures OPTIONS requests are properly handled for all routes
 */
function corsPreflightHandler(req, res, next) {
  if (req.method === 'OPTIONS') {
    // Respond to preflight requests
    res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    
    return res.status(200).end();
  }
  
  next();
}

module.exports = corsPreflightHandler;
