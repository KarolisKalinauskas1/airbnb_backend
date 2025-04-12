const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors'); // Add this line
const bodyParser = require('body-parser'); // Add this line

const prisma = new PrismaClient();

// Import your routers
const indexRouter = require('./routes/index');
const campersRouter = require('./routes/campers');
const userRouter = require('./routes/users')
const dashboardRouter = require('./routes/dashboard');
const bookingsRouter = require('./routes/bookings'); // Add this line

const app = express();

// Add this before other middleware
app.use('/api/bookings/webhook', bodyParser.raw({ type: 'application/json' }));

// Add CORS middleware before other middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature']
}));

// view engine setup (using jade/pug, you can change if needed)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Use your routers
app.use('/', indexRouter);
app.use('/camping-spots', campersRouter);
app.use('/api/camping-spots', campersRouter);
app.use('/users', userRouter);
app.use('/api/users', userRouter);
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
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
