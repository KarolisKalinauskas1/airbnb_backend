// Enhanced CORS configuration middleware for app.js
const corsMiddleware = (req, res, next) => {
  // Hard-coded list of allowed origins for production (make sure to include your current frontend URL)
  const hardcodedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
    'https://airbnb-frontend-i8p5-6wqdroofv-karoliskalinauskas1s-projects.vercel.app', // Added the new Vercel domain
    'https://airbnb-frontend-gamma.vercel.app',
    'https://airbnb-frontend-i8p5.vercel.app',
    'https://*.vercel.app'
  ];

  // Parse the CORS_ORIGIN environment variable which can be a comma-separated list
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || hardcodedOrigins;

  // Get the origin from the request
  const origin = req.headers.origin;
  
  console.log(`CORS check: Origin=${origin}, Allowed=${allowedOrigins.join(', ')}`);
  
  // CRITICAL FIX: For production, just allow all origins temporarily to debug
  if (process.env.NODE_ENV === 'production') {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    return next();
  }// Handle preflight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    // Set CORS headers for preflight requests
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    return res.status(204).send();
  }
  
  // Allow all origins in development, or when CORS_ORIGIN includes '*'
  if (process.env.NODE_ENV === 'development' || allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    return next();
  }
  
  // No origin (like a REST client) - allow
  if (!origin) {
    return next();
  }
  
  // Check against our allowed origins (support for wildcard domains)
  const isAllowed = allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace('*', '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return origin === allowed;
  });
  
  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    return next();
  } else {
    // Log CORS errors for debugging
    console.error(`CORS blocked request from origin: ${origin}`);
    return res.status(403).json({
      error: 'CORS Error',
      message: `Origin ${origin} not allowed by CORS policy`
    });
  }
};

module.exports = corsMiddleware;
