const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const logger = require('morgan');
const helmet = require('helmet');
const prisma = require('./config/prisma');

// Import routes
const authRoutes = require('../features/auth/routes');
const userRoutes = require('../features/users/routes');
const campingSpotsRoutes = require('../features/camping/routes');
const bookingRoutes = require('../features/bookings/routes');
const reviewRoutes = require('../features/reviews/routes');
const dashboardRoutes = require('../features/dashboard/routes');

// Import middleware
const { errorHandler } = require('../shared/middleware/error');
const routeAccessMiddleware = require('../shared/middleware/route-access');
const { authenticate } = require('../features/auth/middleware');
const { optionalAuthenticate } = require('../features/auth/middleware');

// Create Express app
const app = express();

// Basic middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.NODE_ENV === 'development' ? '*' : '']
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Enhanced CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
      'https://airbnb-frontend-gamma.vercel.app',
      'https://*.vercel.app'
    ].filter(Boolean);

    if (!origin || allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const domain = allowed.replace('*', '.*');
        return new RegExp(`^${domain}$`).test(origin);
      }
      return origin === allowed;
    })) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token'
  ],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
  credentials: true,
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'pong' });
});

app.get('/api/ping', (req, res) => {
  res.status(200).json({ status: 'pong' });
});

// Database connection check middleware
app.use(async (req, res, next) => {
  try {
    // Import the connection helper
    const { ensureConnection } = require('./config/prisma');
    
    // Try to ensure connection before proceeding
    await ensureConnection();
    
    // If we get here, the connection is established
    next();
  } catch (error) {
    console.error('Database connection error in middleware:', error);
    res.status(503).json({ 
      error: 'Database service unavailable', 
      message: 'The server is experiencing database connectivity issues. Please try again later.'
    });
  }
});

// Apply route access middleware BEFORE mounting routes
app.use('/api', (req, res, next) => {
  console.log('API request received:', req.method, req.path);
  routeAccessMiddleware(req, res, next);
});

// Mount routes after middleware
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/camping-spots', campingSpotsRoutes);
app.use('/api/geocoding', campingSpotsRoutes);

// Mount bookings routes
app.use('/api/bookings', bookingRoutes);

app.use('/api/reviews', authenticate, reviewRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  if (err) {
    console.error('API Error:', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: err.message,
        details: err.details
      });
    }

    if (err.name === 'PrismaClientKnownRequestError') {
      return res.status(400).json({
        error: 'Database Error',
        message: 'Invalid data provided',
        code: err.code
      });
    }

    if (err.name === 'PrismaClientInitializationError') {
      return res.status(503).json({
        error: 'Database Service Unavailable',
        message: 'Database connection failed'
      });
    }

    // Default error response
    res.status(err.status || 500).json({
      error: err.name || 'Server Error',
      message: err.message || 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `${req.method} ${req.path} not found`,
    suggestions: [
      'Check the URL and try again',
      'Refer to /api/docs for API documentation',
      'Contact support if you believe this is a mistake'
    ]
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  // Log to monitoring service in production
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Log to monitoring service before exiting
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;