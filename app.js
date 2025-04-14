const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');

// Import middleware
const ensureCorsHeaders = require('./middleware/cors-headers');
const apiPathNormalizer = require('./middleware/api-path-normalizer');
const requestLogger = require('./middleware/request-logger');
const apiResponseHandler = require('./middleware/api-response-handler');
const { debug } = require('./utils/logger');
const { enforceJsonForApi } = require('./middlewares/content-type'); // Add this line
const errorHandler = require('./middleware/error-handler'); // Add this line

// Import routes
const indexRouter = require('./routes/index');
const campersRouter = require('./routes/campers');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const dashboardRouter = require('./routes/dashboard');
const bookingsRouter = require('./routes/bookings');
const webhooksRouter = require('./routes/webhooks'); // Add this line
const reviewsRouter = require('./routes/reviews');
const diagnosticsRouter = require('./routes/diagnostics');

const app = express();

// Update the CORS configuration with proper settings
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Add a specific middleware to handle CORS preflight requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    // Handle preflight requests immediately
    return res.status(200).end();
  }
  
  next();
});

// Add this before other middleware to ensure proper CORS handling
app.use((req, res, next) => {
  // Detect if this is a browser page refresh
  const isHTMLRequest = req.headers.accept && req.headers.accept.includes('text/html');
  const isAPIRequest = req.path.startsWith('/api/');
  
  if (isHTMLRequest && !isAPIRequest) {
    // Requesting an HTML page - set proper CORS headers for redirection
    res.set({
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true'
    });
  }
  next();
});

// Apply the CORS headers middleware after the main CORS middleware
app.use(ensureCorsHeaders);

// Add request logger for debugging
app.use(requestLogger);

// Add API path normalizer middleware
app.use(apiPathNormalizer);

// view engine setup (using jade/pug, you can change if needed)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));

// Special handling for Stripe webhook route - must be before general JSON parser
// This ensures the raw body is preserved for webhook signature verification
app.use('/api/bookings/webhook', (req, res, next) => {
  if (req.originalUrl === '/api/bookings/webhook' && req.method === 'POST') {
    // Let the webhook middleware handle this
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Apply default middleware for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Add middleware for content negotiation - add this before routes
app.use(enforceJsonForApi);

// Apply API response middleware before routes
app.use(apiResponseHandler);

// Mount all routes directly with clear structure
// API routes with /api prefix
app.use('/api/camping-spots', campersRouter);
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/webhooks', webhooksRouter);

// Direct routes without /api prefix (for backwards compatibility)
app.use('/camping-spots', campersRouter);
app.use('/users', usersRouter);
app.use('/auth', authRouter);
app.use('/dashboard', dashboardRouter);
app.use('/bookings', bookingsRouter);
app.use('/webhooks', webhooksRouter);
app.use('/reviews', reviewsRouter);
app.use('/diagnostics', diagnosticsRouter);

// Add health check endpoint at both locations
app.get('/api/health', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Mount the index router LAST to avoid it capturing API routes
app.use('/', indexRouter);

// Add a catch-all route for SPA navigation - this must be after API routes but before 404
app.get('*', (req, res, next) => {
  // Skip API routes - they should have been handled already
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Check if this is a browser request for HTML
  const isHTMLRequest = req.headers.accept && req.headers.accept.includes('text/html');
  if (isHTMLRequest) {
    // Serve the SPA index page
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  
  // Continue to 404 for other requests
  next();
});

// Make sure to move the 404 handler to be AFTER all your routes
app.use((req, res, next) => {
  // If it's an API request that made it here, it's a 404
  if (req.path.startsWith('/api/')) {
    return next(createError(404));
  }
  
  // For all other routes, redirect to frontend to let its router handle it
  // This is a fallback in case the /* route in index.js doesn't catch it
  res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
});

// Catch 404 and forward to error handler - this must be AFTER the catch-all route
app.use((req, res, next) => {
  next(createError(404));
});

// Replace the existing error handler with our enhanced one
app.use(errorHandler);

module.exports = app;
