const PUBLIC_PATHS = [
  '/api/amenities',
  '/api/countries',
  '/api/camping-spots/amenities',
  '/api/camping-spots/countries',
  '/amenities',
  '/countries',
  '/camping-spots/amenities',
  '/camping-spots/countries'
];

// Middleware to handle CORS for public endpoints
const publicCorsMiddleware = (req, res, next) => {
  const path = req.path;
  const isPublicPath = PUBLIC_PATHS.some(publicPath => 
    path === publicPath || path.startsWith(publicPath + '/')
  );

  if (isPublicPath || req.headers['x-public-route'] === 'true') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route',
      'Cache-Control': 'public, max-age=300'
    });

    // Handle OPTIONS requests for CORS preflight
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
  }

  next();
};

module.exports = publicCorsMiddleware;
