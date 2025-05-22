const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

// Initialize Prisma with secure logging
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' 
    ? ['error'] 
    : ['query', 'error', 'warn']
});

// Enhanced JWT configuration with more secure options
const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-super-secret-key-here',
  options: {
    expiresIn: '24h', // Shorter token lifetime
    algorithm: 'HS256',
    audience: process.env.JWT_AUDIENCE || 'camping-app',
    issuer: process.env.JWT_ISSUER || 'camping-auth'
  }
};

// Enhanced CORS configuration with strict security
const corsConfig = {
  origin: function (origin, callback) {
    // In production, only allow configured origins
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      ...(process.env.ADDITIONAL_ORIGINS || '').split(',').filter(Boolean)
    ];

    // Allow localhost in development
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
    }
    
    // Block requests with no origin (except in development)
    if (!origin && process.env.NODE_ENV !== 'development') {
      return callback(new Error('Not allowed by CORS - origin required'), false);
    }

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token'
  ],
  exposedHeaders: ['X-New-Token'], // For token refresh
  credentials: true,
  maxAge: 3600, // 1 hour (in seconds)
  optionsSuccessStatus: 204,
  preflightContinue: false
};

// Enhanced token verification with additional checks
const verifyToken = (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }

    // Remove 'Bearer ' prefix if present
    const tokenWithoutBearer = token.replace('Bearer ', '');

    // Verify token with all security options
    const decoded = jwt.verify(tokenWithoutBearer, jwtConfig.secret, {
      algorithms: ['HS256'],
      audience: jwtConfig.options.audience,
      issuer: jwtConfig.options.issuer,
      clockTolerance: 30 // 30 seconds clock skew tolerance
    });
    
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    // Additional checks
    if (!decoded.email || !decoded.sub) {
      throw new Error('Invalid token payload');
    }

    return decoded;
  } catch (error) {
    console.error('Token verification error:', error.message);
    throw error;
  }
};

module.exports = {
  prisma,
  jwtConfig,
  corsConfig,
  verifyToken
};