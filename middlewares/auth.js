const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
const { jwtConfig } = require('../config/api-endpoints');
const { createClient } = require('@supabase/supabase-js');

// List of public routes that don't require authentication
const publicRoutes = [
  '/api/amenities',
  '/api/camping-spots/amenities',
  '/api/camping-spots/countries',
  '/api/countries',
  // Extra variations for consistent handling
  '/amenities',
  '/camping-spots/amenities',
  '/camping-spots/countries',
  '/countries'
];

// Check if route is public
const isPublicRoute = (req) => {
  const path = req.path;
  const originalUrl = req.originalUrl || path;
  
  console.log('Checking if route is public:', {
    path,
    originalUrl,
    method: req.method,
    isPublicHeader: !!req.headers['x-public-route'] || !!req.headers['X-Public-Route']
  });

  // Normalize paths by removing any trailing slashes and convert to lowercase for consistent comparison
  const normalizedPath = path.replace(/\/+$/, '').toLowerCase();
  const normalizedUrl = originalUrl.replace(/\/+$/, '').toLowerCase();

  // Check if it's a public detail page request (be precise with the regex)
  const isCampingSpotDetail = normalizedPath.match(/^\/api\/camping-spots\/\d+$/) !== null || 
                            normalizedUrl.match(/^\/api\/camping-spots\/\d+$/) !== null;

  // Check both x-public-route and X-Public-Route for case-insensitive matching
  const hasPublicHeader = req.headers['x-public-route']?.toLowerCase() === 'true' || 
                         req.headers['X-Public-Route']?.toLowerCase() === 'true';
  
  // Check various conditions for public access
  const isPublic = publicRoutes.includes(normalizedPath) || 
                   publicRoutes.includes(normalizedUrl) ||
                   hasPublicHeader ||
                   isCampingSpotDetail ||
                   // Also match paths that have query parameters
                   publicRoutes.some(route => normalizedPath.startsWith(route + '?') || normalizedUrl.startsWith(route + '?'));

  console.log('Route public status:', { 
    normalizedPath, 
    normalizedUrl,
    isPublic, 
    isCampingSpotDetail, 
    hasPublicHeader 
  });
  
  return isPublic;
};

// Initialize Supabase client with autoRefreshToken enabled
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    }
  }
);

// Enhanced authentication middleware with better error handling and token refresh
const authenticate = async (req, res, next) => {
  try {
    // Log request details
    console.log('Auth middleware - Request:', {
      path: req.path,
      originalUrl: req.originalUrl,
      method: req.method,
      headers: {
        hasAuth: !!req.headers.authorization,
        origin: req.headers.origin,
        contentType: req.headers['content-type'],
        isPublicRoute: req.headers['x-public-route'] || req.headers['X-Public-Route']
      }
    });

    // Check if this is a public route first
    if (isPublicRoute(req)) {
      console.log('Auth middleware - Skipping authentication for public route:', req.path);
      return next();
    }

    // Get token from different possible sources
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                 req.cookies?.token || 
                 req.body?.token;

    if (!token) {
      console.log('No token provided');
      return res.status(401).json({
        error: 'Authentication Required',
        message: 'No authentication token provided'
      });
    }

    let user = null;
    let tokenError = null;

    // Try Supabase first
    try {
      console.log('Attempting Supabase token verification...');
      const { data: { session }, error } = await supabase.auth.getSession(token);
      
      if (error) {
        console.log('Supabase session error:', error);
        throw error;
      }

      if (!session?.user?.email) {
        throw new Error('No user email in Supabase session');
      }

      user = await prisma.users.findUnique({
        where: { email: session.user.email },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          verified: true
        }
      });

      if (user) {
        console.log('Successfully authenticated via Supabase:', user.email);
      }
    } catch (supabaseError) {
      console.log('Supabase authentication failed:', supabaseError.message);
      tokenError = supabaseError;
    }

    // If Supabase failed, try application JWT
    if (!user) {
      try {
        console.log('Attempting application JWT verification...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'development-secret-key');
        
        if (!decoded?.email) {
          throw new Error('No email in JWT payload');
        }

        user = await prisma.users.findUnique({
          where: { email: decoded.email },
          select: {
            user_id: true,
            email: true,
            full_name: true,
            isowner: true,
            verified: true
          }
        });

        if (user) {
          console.log('Successfully authenticated via JWT:', user.email);
        }
      } catch (jwtError) {
        console.log('JWT authentication failed:', jwtError.message);
        // Only set tokenError if we don't already have one from Supabase
        if (!tokenError) tokenError = jwtError;
      }
    }

    // If we still don't have a user, authentication has failed
    if (!user) {
      console.error('Authentication failed completely:', tokenError?.message);
      return res.status(401).json({
        error: 'Authentication Failed',
        message: tokenError?.message || 'Invalid authentication token',
        code: tokenError?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
      });
    }

    // Attach the verified user to the request
    req.user = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      isowner: user.isowner,
      verified: user.verified
    };

    next();
  } catch (error) {
    console.error('Unhandled authentication error:', error);
    return res.status(500).json({
      error: 'Authentication Error',
      message: 'An unexpected error occurred during authentication'
    });
  }
};

// Completely rewritten optional authentication middleware with better handling of invalid tokens
const optionalAuthenticate = async (req, res, next) => {
  try {
    console.log('Optional Auth middleware - Checking request headers:', {
      hasAuth: !!req.headers.authorization,
      hasCookie: !!req.cookies?.token,
      hasBody: !!req.body?.token
    });

    // Get token from different possible sources
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                 req.cookies?.token || 
                 req.body?.token;

    if (!token) {
      console.log('Optional Auth: No token provided, continuing as unauthenticated');
      req.isOptionalAuth = true;
      return next();
    }

    try {
      let user;
      let decoded;

      // First try to verify as a Supabase token
      try {
        // Set the session with the token
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: ''
        });

        if (sessionError) throw sessionError;

        const supabaseUser = sessionData.session?.user;
        if (!supabaseUser) throw new Error('No user found in Supabase session');

        console.log('Optional Auth: Successfully verified Supabase token for user:', supabaseUser.email);

        // Get or create user in our database
        user = await getOrCreateUser(supabaseUser);
        decoded = { 
          email: supabaseUser.email,
          sub: user.user_id
        };

      } catch (supabaseError) {
        console.log('Optional Auth: Supabase token verification failed, trying application JWT...');

        // If Supabase token verification fails, try application JWT
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET || 'development-secret-key');
          console.log('Optional Auth: Successfully verified application JWT token');
          
          if (!decoded.email) {
            throw new Error('Email is required in token');
          }

          // Find user by email in our database
          user = await prisma.users.findUnique({
            where: { email: decoded.email },
            select: {
              user_id: true,
              email: true,
              full_name: true,
              isowner: true,
              verified: true
            }
          });
        } catch (appTokenError) {
          console.log('Optional Auth: Application JWT verification failed, continuing as unauthenticated');
          req.isOptionalAuth = true;
          return next();
        }
      }

      if (!user) {
        console.log('Optional Auth: User not found, continuing as unauthenticated');
        req.isOptionalAuth = true;
        return next();
      }

      req.user = {
        user_id: user.user_id.toString(),
        email: user.email,
        full_name: user.full_name,
        isowner: user.isowner,
        verified: user.verified
      };
      console.log('Optional Auth: Successfully authenticated user:', req.user.email);
      req.isOptionalAuth = true;
      next();

    } catch (error) {
      console.log('Optional Auth: Token verification failed, continuing as unauthenticated:', error.message);
      req.isOptionalAuth = true;
      next();
    }
  } catch (error) {
    console.error('Optional Auth: Unexpected error:', error);
    req.isOptionalAuth = true;
    next();
  }
};

// Helper function to get or create a user in our database
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
    // Create new user if they don't exist
    user = await prisma.users.create({      data: {
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name || '',
        isowner: false, // Default to false for new users
        verified: true  // If they authenticated with Supabase, they're verified
      },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        verified: true
      }    });
  }

  return user;
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  getOrCreateUser
};
