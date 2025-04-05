const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors'); // Add this line

const prisma = new PrismaClient();

// Import your routers
const indexRouter = require('./routes/index');
const campersRouter = require('./routes/campers');
const userRouter = require('./routes/users')
const dashboardRouter = require('./routes/dashboard');

const app = express();

// Add CORS middleware before other middleware
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
app.use('/api/users', userRouter);
app.use('/api/dashboard', dashboardRouter);

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
