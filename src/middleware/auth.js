const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

// Ensure JWT secret is properly set
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. This is a critical security issue.');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with enhanced configuration
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

// Enhanced rate limiting configuration
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
  skip: (req) => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    // Use X-Forwarded-For if available (for proxy support)
    return req.headers['x-forwarded-for'] || req.ip;
  }
});

// Different rate limits for different endpoints
const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  'Too many authentication attempts, please try again later'
);

const loginRateLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  5, // 5 failed attempts
  'Too many failed login attempts, please try again later'
);

const passwordResetLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // 3 attempts
  'Too many password reset attempts, please try again later'
);

/**
 * Get or create a user in our database from Supabase user data
 */
async function getOrCreateUser(supabaseUser) {
  let user = await prisma.users.findUnique({
    where: { email: supabaseUser.email },
    select: {
      user_id: true,
      email: true,
      full_name: true,
      isowner: true,
      verified: true
    }
  });

  if (!user) {
    console.log('Creating new user from Supabase data:', supabaseUser.email);
    user = await prisma.users.create({
      data: {
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0],
        isowner: supabaseUser.user_metadata?.isowner || '0',
        verified: 'yes',
        created_at: new Date(),
        updated_at: new Date()
      },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        verified: true
      }
    });
  }

  return user;
}

// Define protected paths that should never be public
const PROTECTED_PATHS = [
  '/api/users',
  '/api/bookings',
  '/api/dashboard',
  '/api/reviews/create',
  '/api/camping-spots/create',
  '/api/camping-spots'  // POST requests to /api/camping-spots are protected
];

// List of public endpoints - always accessible without authentication
const PUBLIC_ENDPOINTS = [
  '/api/amenities',
  '/api/countries',
  '/api/camping-spots/amenities',
  '/api/camping-spots/countries',
  '/amenities',
  '/countries',
  '/camping-spots/amenities',
  '/camping-spots/countries',
  '/auth/login',
  '/auth/register',
  '/auth/signup',
  '/auth/signin',
  '/health',
  '/status',
  '/api/health',
  '/api/status'
];

// Check if a route should be public
const isPublicRoute = (path, method) => {
  // Convert path to lowercase and remove trailing slash for consistent comparison
  const normalizedPath = path.toLowerCase().replace(/\/$/, '');
  
  // First check if it's a protected path
  const isProtected = PROTECTED_PATHS.some(protectedPath => {
    const isExactMatch = normalizedPath === protectedPath.toLowerCase();
    const isSubPath = normalizedPath.startsWith(protectedPath.toLowerCase() + '/');
    
    // If the path is /api/camping-spots, only protect non-GET methods
    if (protectedPath === '/api/camping-spots') {
      return (isExactMatch || isSubPath) && method !== 'GET';
    }
    return isExactMatch || isSubPath;
  });

  if (isProtected) {
    return false;
  }
  
  // For GET requests to /api/camping-spots or its subpaths, consider them public
  if (method === 'GET' && 
      (normalizedPath === '/api/camping-spots' || 
       normalizedPath.startsWith('/api/camping-spots/'))) {
    return true;
  }
  
  // Check against public endpoints list
  const publicEndpoints = PUBLIC_ENDPOINTS;

  // Check exact matches
  if (publicEndpoints.includes(normalizedPath)) {
    return true;
  }

  // Check patterns for public endpoints
  const isPublicPattern = /^\/?(api\/)?(camping-spots|amenities|countries)(\/\d+)?$/i.test(normalizedPath) ||
                         /^\/?(api\/)?auth\/(login|register|reset-password)$/i.test(normalizedPath) ||
                         /^\/?(api\/)?(health|status)$/i.test(normalizedPath);

  return isPublicPattern;
};

// User authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Get token from request
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify token
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) {
      if (error.status === 401) {
        return res.status(401).json({ 
          error: 'Token expired or invalid',
          message: 'Please log in again'
        });
      }
      throw error;
    }

    // Get or create user in our database
    const dbUser = await getOrCreateUser(user);
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found in database' });
    }

    // Attach user to request
    req.user = {
      ...dbUser
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Optional authentication middleware
const optionalAuthenticate = async (req, res, next) => {
  try {
    const path = req.path.replace(/^\/api\//, '');
    if (isPublicRoute(path, req.method) || req.method === 'OPTIONS') {
      return next();
    }

    await authenticate(req, res, (err) => {
      if (err && err.status !== 401) {
        next(err);
      } else {
        next();
      }
    });
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  authRateLimiter,
  optionalAuthenticate,
  loginRateLimiter,
  passwordResetLimiter,
  isPublicRoute
};