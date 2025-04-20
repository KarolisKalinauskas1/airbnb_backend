const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const { debug, errorWithContext } = require('./utils/logger');

// Import middleware
const spaHandler = require('./middleware/spa-handler');
const dbConnectionCheck = require('./middleware/db-connection-check');
const { enforceJsonForApi } = require('./middlewares/content-type');
const apiResponseHandler = require('./middleware/api-response-handler');
const apiCircuitBreaker = require('./middleware/apiCircuitBreaker');
const contentTypeMiddleware = require('./middleware/content-type-middleware');
const contentNegotiation = require('./middleware/content-negotiation');
const corsHandler = require('./middleware/cors-handler');
const corsPreflightHandler = require('./middleware/cors-preflight-handler');
const defaultParamsMiddleware = require('./middleware/default-params');

// Import routes
const indexRouter = require('./routes/index');
const campersRouter = require('./routes/campers');
const userRouter = require('./routes/users');
const dashboardRouter = require('./routes/dashboard');
const bookingsRouter = require('./routes/bookings');
const authRouter = require('./routes/auth');
const webhooksRouter = require('./routes/webhooks');
const healthRouter = require('./routes/health');
const diagnosticsRouter = require('./routes/diagnostics');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Apply CORS middleware first
app.use(corsHandler);
app.use(corsPreflightHandler);

// Basic middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Apply default parameters to specific routes
app.use(defaultParamsMiddleware);

// Add our improved content negotiation middleware
app.use(contentTypeMiddleware);

// Content negotiation to ensure proper responses
app.use(contentNegotiation);
app.use(enforceJsonForApi);
app.use(apiResponseHandler);

// Rate limiting for API endpoints
app.use('/api', apiCircuitBreaker);

// Health check doesn't need DB check - always accessible
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);

// Apply database connection check for API routes
app.use('/api', dbConnectionCheck);

// Routes
app.use('/', indexRouter);
app.use('/camping-spots', campersRouter);
app.use('/api/camping-spots', campersRouter);
app.use('/users', userRouter);
app.use('/api/users', userRouter);
app.use('/dashboard', dashboardRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/bookings', bookingsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/auth', authRouter);
app.use('/auth', authRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/diagnostics', diagnosticsRouter);

// Serve static files - must be after API routes but before SPA handling
app.use(express.static(path.join(__dirname, 'public')));

// SPA routes - anything not matched above will go to the SPA
app.get('/camping-spot/*', function(req, res) {
  // Frontend routes should serve the index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/account/*', function(req, res) {
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
