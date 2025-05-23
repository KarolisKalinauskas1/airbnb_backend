// Production-ready CORS middleware with proper origin validation
const simpleCorsMiddleware = (req, res, next) => {
  const allowedOrigins = [
    'https://airbnb-frontend-gamma.vercel.app',
    'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174'
  ];
  
  const origin = req.headers.origin;
  const isAllowedOrigin = !origin || allowedOrigins.includes(origin);
  
  // Log the request for debugging
  console.log(`CORS: Request from ${origin} to ${req.method} ${req.path} (${isAllowedOrigin ? 'allowed' : 'blocked'})`);
    // Set CORS headers for allowed origins
  if (isAllowedOrigin) {
    // Log detailed request information for debugging
    console.log('Request details:', {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      origin: origin,
      headers: {
        authorization: req.headers.authorization ? 'present' : 'missing',
        contentType: req.headers['content-type'],
        accept: req.headers.accept
      }
    });

    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  
  next();
};

module.exports = simpleCorsMiddleware;
