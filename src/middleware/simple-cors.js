// Simple CORS middleware that allows all origins
// This is for debugging only - don't use in production long-term
const simpleCorsMiddleware = (req, res, next) => {
  // Get the origin from the request
  const origin = req.headers.origin || '*';
  
  // Log the request for debugging
  console.log(`CORS simplification: Request from ${origin} to ${req.method} ${req.path}`);
  
  // Set CORS headers for all requests
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  
  next();
};

module.exports = simpleCorsMiddleware;
