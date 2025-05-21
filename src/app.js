const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
// Morgan logger removed for production
const helmet = require('helmet');
const prisma = require('./config/prisma');

// Import routes from src/routes (consolidated structure)
const authRoutes = require('./routes/auth');
const authOauthRoutes = require('./routes/auth/oauth');
const googleAuthRoutes = require('./routes/auth/google');
const userRoutes = require('./routes/users');
const campingSpotsRoutes = require('./routes/campingSpots');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const dashboardRoutes = require('./routes/dashboard');
const healthRoutes = require('./routes/health');
// Import middleware
const { errorHandler } = require('./middleware/error');
const routeAccessMiddleware = require('./middleware/route-access');
const { authenticate } = require('./middleware/auth');
const { optionalAuthenticate } = require('./middleware/auth'); // Import optionalAuthenticate middleware

// Create Express app
const app = express();

// Basic middleware
// Logger disabled for production
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.example.com']
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
}));

// CORS configuration with enhanced error handling and logging
app.use(cors({
  origin: function(origin, callback) {
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://airbnb-frontend-i8p5-88p7a4emc-karoliskalinauskas1s-projects.vercel.app',
      'https://airbnb-frontend.vercel.app',
      'https://*.vercel.app',
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL
    ].filter(Boolean); // Remove undefined/null values
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.warn('Request with no origin - allowing (e.g., curl requests)');
      return callback(null, true);
    }
    
    // Check if the origin is in the allowed list
    if (allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Handle wildcard subdomains
        const domain = allowed.replace('*', '.*');
        return new RegExp(`^${domain}$`).test(origin);
      }
      return origin === allowed;
    })) {
      return callback(null, true);
    }
    
    console.error(`CORS blocked for origin: ${origin}. Allowed origins:`, allowedOrigins);
    callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Handle preflight requests
app.options('*', cors());

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
app.use('/api/auth/oauth', authOauthRoutes);
app.use('/api/auth/oauth/google', googleAuthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/camping-spots', campingSpotsRoutes);
app.use('/api/geocoding', campingSpotsRoutes);
app.use('/api/bookings', bookingRoutes);
// Make reviews publicly accessible without authentication
app.use('/api/reviews', reviewRoutes);  
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/health', healthRoutes);



// Error handling middleware
app.use(errorHandler);

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit in production/serverless environment
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Graceful shutdown - conditional for serverless environments
if (process.env.NODE_ENV !== 'production') {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
  });
} else {
  // In serverless environments, handle shutdown differently
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received in serverless environment');
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Error during prisma disconnect:', err);
    }
    // Don't exit process in serverless environment
  });
}

module.exports = app;