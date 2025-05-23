// Production-ready CORS middleware with proper origin validation
const simpleCorsMiddleware = (req, res, next) => {
  // Function to check if origin matches our Vercel deployment pattern
  const isVercelDeployment = (origin) => {
    // Match any URL under your project's Vercel domain
    return /^https:\/\/airbnb-frontend[a-zA-Z0-9-.]+-karoliskalinauskas1s-projects\.vercel\.app$/.test(origin) ||
           /^https:\/\/airbnb-frontend[a-zA-Z0-9.-]+\.vercel\.app$/.test(origin);
  };

  // Static allowed origins
  const allowedOrigins = [
    'https://airbnb-frontend-gamma.vercel.app',
    'https://airbnb-frontend-i8p5.vercel.app',
    'https://airbnb-frontend-i8p5-lmcdchm0z-karoliskalinauskas1s-projects.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000'
  ];
    const origin = req.headers.origin;  const isAllowedOrigin = !origin || allowedOrigins.includes(origin) || isVercelDeployment(origin);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    if (isAllowedOrigin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, access-control-allow-origin');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      return res.status(204).end();
    }
  }
  
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

    res.header('Access-Control-Allow-Origin', origin || '*');    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, access-control-allow-origin, Access-Control-Allow-Headers, Access-Control-Allow-Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    res.header('Vary', 'Origin, Access-Control-Request-Headers');

    if (req.method === 'OPTIONS') {
      return res.status(204).send();
    }  } else {
    // Log blocked request and detailed information
    console.warn('CORS: Blocked request:', {
      origin,
      method: req.method,
      path: req.path,
      headers: {
        'content-type': req.headers['content-type'],
        'accept': req.headers.accept,
        'origin': req.headers.origin,
        'access-control-request-method': req.headers['access-control-request-method'],
        'access-control-request-headers': req.headers['access-control-request-headers']
      }
    });

    // For OPTIONS requests, still return proper CORS error
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, access-control-allow-origin, Access-Control-Allow-Headers, Access-Control-Allow-Origin');
      return res.status(403).json({ 
        error: 'CORS Error',
        message: 'Origin not allowed by CORS policy',
        allowedOrigins
      });
    }
  }
  
  next();
};

module.exports = simpleCorsMiddleware;
