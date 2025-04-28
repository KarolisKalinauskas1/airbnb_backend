const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

// Initialize Prisma
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' 
    ? ['error'] 
    : ['query', 'error', 'warn']
});

// Simple JWT configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-super-secret-key-here'
};

// CORS configuration
const corsConfig = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
};

// Proper token verification
const verifyToken = (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }

    // Remove 'Bearer ' prefix if present
    const tokenWithoutBearer = token.replace('Bearer ', '');

    // Verify and decode the token
    const decoded = jwt.verify(tokenWithoutBearer, jwtConfig.secret);
    
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    return decoded;
  } catch (error) {
    console.error('Token verification error:', error.message);
    throw new Error('Invalid token');
  }
};

module.exports = {
  prisma,
  corsConfig,
  verifyToken,
  jwtConfig
}; 