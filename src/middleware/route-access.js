const { authenticate } = require('./auth');

// List of routes that should be public (no authentication required)
const publicRoutes = [
  // Auth routes
  '/auth/signin',
  '/auth/login',
  '/auth/signup',
  '/auth/register',
  '/auth/reset-password',
  '/auth/update-password',
  '/auth/refresh-token',
  '/auth/status',
  '/auth/session',
  '/auth/restore-session',
  '/auth/verify-token',
  '/auth/sync-session',
  '/auth/logout',
  '/auth/signout',
  
  // Auth routes with api prefix
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/reset-password',
  '/api/auth/update-password',
  '/api/auth/refresh-token',
  '/api/auth/status',
  '/api/auth/session',
  '/api/auth/restore-session',
  '/api/auth/verify-token',
  '/api/auth/sync-session',
  '/api/auth/logout',
  '/api/auth/signout',
    // API info routes
  '/api',
  '/api/ping',
  '/api/docs',
  '/api/docs/json',
  '/api/status',
  '/api/health',
    // OAuth routes
  '/api/auth/oauth/google/login',
  '/api/auth/oauth/google/callback',
  '/auth/oauth/google/login',
  '/auth/oauth/google/callback',
  '/api/auth/oauth/google/supabase-callback', // Supabase callback handler
  
    // Public data routes - only for GET requests (POST requires auth)
  // Routes for specific camping spots features that are public
  '/api/camping-spots/search',
  '/camping-spots/search',
  '/api/camping-spots/featured',
  '/camping-spots/featured',
  '/api/camping-spots/nearby',
  '/camping-spots/nearby',
  '/api/camping-spots/geocoding/search',
  '/camping-spots/geocoding/search',
  '/api/geocoding/search',
  '/geocoding/search',
  '/api/locations',
  '/locations',
  '/api/countries',
  '/countries',
  '/api/amenities',
  '/amenities',  '/api/camping-spots/amenities',
  '/camping-spots/amenities',
  '/api/camping-spots/countries',
  '/camping-spots/countries',
  
  // Booking success route
  '/api/bookings/success',
  '/bookings/success'
];

// List of public route patterns (for routes with parameters)
const publicPatterns = [  
  /^\/?(api\/)?auth\/(register|login|signin|signup|reset\-password|update\-password|refresh\-token)(\?.*)?$/,  // Auth routes with parameters
  /^\/?(api\/)?auth\/oauth\/google\/(login|callback|supabase-callback)(\?.*)?$/, // OAuth Google routes with parameters
  /^\/social-auth-success(\?.*)?$/, // Social auth success page with any query parameters
  // Note: We now handle camping-spots separately based on HTTP method below
  /^\/?(api\/)?camping-spots\/geocoding\/search(\?.*)?$/, // Allow geocoding search
  /^\/?(api\/)?geocoding\/search(\?.*)?$/, // Allow direct geocoding search
  /^\/?(api\/)?camping-spots\/search(\?.*)?$/, // Allow search
  /^\/?(api\/)?camping-spots\/featured(\/)?$/, // Allow featured spots
  /^\/?(api\/)?camping-spots\/nearby(\/)?(\?.*)?$/, // Allow nearby spots  
  /^\/?(api\/)?locations(\/)?$/, // Allow locations
  /^\/?(api\/)?countries(\/)?$/, // Allow countries
  /^\/?(api\/)?amenities(\/)?$/ // Allow amenities
];

// List of owner-only routes
const ownerRoutes = [
  '/api/dashboard/spots',
  '/dashboard/spots',
  '/api/dashboard/bookings',
  '/dashboard/bookings'
];

// Middleware to check if a route should be public or protected
const routeAccessMiddleware = (req, res, next) => {
  const path = req.path;
  const method = req.method;
  const fullUrl = req.originalUrl || req.url;

  console.log('Route access check:', {
    path,
    method,
    fullUrl,
    headers: req.headers
  });

  // Always allow OPTIONS requests (for CORS)
  if (method === 'OPTIONS') {
    console.log('Allowing OPTIONS request');
    return next();
  }

  // Check if the route is in the public routes list
  if (publicRoutes.includes(path)) {
    console.log('Public route match found:', path);
    return next();
  }

  // Check if the route matches any public patterns
  const matchingPattern = publicPatterns.find(pattern => pattern.test(fullUrl));
  if (matchingPattern) {
    console.log('Public pattern match found:', {
      path,
      pattern: matchingPattern.toString()
    });
    return next();
  }
  // For camping spots routes, only allow GET without auth, require auth for POST/PUT/DELETE
  if ((path.startsWith('/api/camping-spots') || path.startsWith('/camping-spots'))) {
    if (method === 'GET') {
      console.log('Allowing GET request to camping spots');
      return next();
    } else {
      console.log('Requiring auth for non-GET camping spots request:', method, path);
      return authenticate(req, res, next);
    }
  }

  // For all other routes, require authentication
  console.log('No public match found, requiring authentication for:', {
    path,
    method,
    fullUrl
  });
  return authenticate(req, res, next);
};

module.exports = routeAccessMiddleware;