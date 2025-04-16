const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const { debug, errorWithContext } = require('./utils/logger');

// Import middleware
const spaHandler = require('./middleware/spa-handler');
const { enforceJsonForApi } = require('./middlewares/content-type');
const apiResponseHandler = require('./middleware/api-response-handler');
const apiCircuitBreaker = require('./middleware/apiCircuitBreaker'); // Add this line
const contentTypeMiddleware = require('./middleware/contentTypeMiddleware');
const contentNegotiation = require('./middleware/content-negotiation');
const corsHandler = require('./middleware/cors-handler');
const corsPreflightHandler = require('./middleware/cors-preflight-handler');

// Import routes
const indexRouter = require('./routes/index');
const campersRouter = require('./routes/campers');
const userRouter = require('./routes/users');
const dashboardRouter = require('./routes/dashboard');
const bookingsRouter = require('./routes/bookings');
const diagnosticsRouter = require('./routes/diagnostics');
const healthRouter = require('./routes/health');

const app = express();

// Setup view engine (needed for error pages)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Handle preflight requests before the CORS middleware
app.use(corsPreflightHandler);

// Apply CORS middleware first
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'], // Frontend URLs
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin']
}));

// Apply additional CORS headers for all responses
app.use(corsHandler);

// Apply content negotiation middleware early to ensure proper content types
app.use(contentNegotiation);

// Add logging middleware
app.use(logger('dev'));

// Special handling for Stripe webhook route - must be before general JSON parser
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

// Apply API circuit breaker for all API routes
app.use('/api', apiCircuitBreaker);

// Apply content type middleware to all routes
app.use(contentTypeMiddleware);

// Apply rate limiters
const rateLimiter = require('./middleware/rateLimiter');
app.use('/api/', rateLimiter);

// Set up routes with proper error handling
app.use('/', indexRouter);

// API routes - keep these routes BEFORE the SPA handler
app.use('/api/camping-spots', campersRouter);
app.use('/api/users', userRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/diagnostics', diagnosticsRouter);
app.use('/api/health', healthRouter);

// Non-API routes that should still return JSON based on Accept header
app.use('/camping-spots', campersRouter);
app.use('/users', userRouter);
app.use('/dashboard', dashboardRouter);
app.use('/bookings', bookingsRouter);
app.use('/diagnostics', diagnosticsRouter);

// Specifically handle dashboard routes to avoid redirect issues
app.get('/dashboard', function(req, res) {
  // Frontend routes should serve the index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard/*', function(req, res) {
  // Frontend routes should serve the index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Apply SPA handler AFTER all API routes
app.use(spaHandler);

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  // Only create 404 errors for API routes, let SPA handle other routes
  if (req.path.startsWith('/api/') || 
      (req.headers.accept && req.headers.accept.includes('application/json'))) {
    next(createError(404));
  } else {
    // For non-API routes, let the SPA handle the routing
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Error handler
app.use((err, req, res, next) => {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Send a JSON error response for API requests or if JSON is accepted
  if (req.path.startsWith('/api/') || 
      (req.headers.accept && req.headers.accept.includes('application/json'))) {
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      error: err.message || 'Internal Server Error',
      status: statusCode,
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }

  // Render the error page for non-API requests that accept HTML
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
