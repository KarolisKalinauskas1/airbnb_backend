const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');

// Import routes
const indexRouter = require('./routes/index');
const campersRouter = require('./routes/campers');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth'); // Fix import - import just the router
const dashboardRouter = require('./routes/dashboard');
const bookingsRouter = require('./routes/bookings');

const app = express();

// Enable CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature']
}));

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

// Use your routers
app.use('/', indexRouter);
app.use('/camping-spots', campersRouter);
app.use('/api/camping-spots', campersRouter);
app.use('/users', usersRouter);
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter); // Use the authRouter directly
app.use('/auth', authRouter); // Use the authRouter directly
app.use('/dashboard', dashboardRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/bookings', bookingsRouter);
app.use('/api/bookings', bookingsRouter);

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// Error handler
app.use((err, req, res, next) => {
  // Set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Send error response
  res.status(err.status || 500);
  res.json({
    error: err.message,
    status: err.status || 500
  });
});

module.exports = app;
