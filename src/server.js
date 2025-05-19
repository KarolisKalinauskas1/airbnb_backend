#!/usr/bin/env node

require('dotenv').config();

const http = require('http');
const debug = require('debug')('airbnb-backend:server');
const app = require('./app');
const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');
const BookingCompletionService = require('./shared/services/booking-completion.service');
const ReminderService = require('./shared/services/reminder.service');
const BookingReviewService = require('./shared/services/booking-review.service');

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ORIGIN'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */
const server = http.createServer(app);

/**
 * Initialize Prisma
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' 
    ? ['error'] 
    : ['query', 'error', 'warn']
});

// Handle Prisma connection errors
prisma.$connect().catch((error) => {
  console.error('Failed to connect to database:', error);
  process.exit(1);
});

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
  console.log(`Server is running on port ${addr.port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

// Schedule the booking completion check to run daily at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily booking completion check...');
  try {
    const completedCount = await BookingCompletionService.processCompletedBookings();
    console.log(`Processed ${completedCount} completed bookings`);
  } catch (error) {
    console.error('Error processing completed bookings:', error);
  }
});

// Schedule booking reminders to run daily at 10:00 AM
cron.schedule('0 10 * * *', async () => {
  console.log('Sending booking reminders...');
  try {
    const reminderCount = await ReminderService.sendBookingReminders();
    console.log(`Sent ${reminderCount} booking reminders`);
  } catch (error) {
    console.error('Error sending booking reminders:', error);
  }
});

// Schedule payment reminders to run every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Sending payment reminders...');
  try {
    const reminderCount = await ReminderService.sendPaymentReminders();
    console.log(`Sent ${reminderCount} payment reminders`);
  } catch (error) {
    console.error('Error sending payment reminders:', error);
  }
});

// Schedule cleanup of expired pending bookings to run daily at 1:00 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Cleaning up expired pending bookings...');
  try {
    const cleanupCount = await BookingCompletionService.cleanupExpiredPendingBookings();
    console.log(`Cleaned up ${cleanupCount} expired pending bookings`);
  } catch (error) {
    console.error('Error cleaning up expired pending bookings:', error);
  }
});

// Schedule review request emails to run daily at 11:00 AM
cron.schedule('0 11 * * *', async () => {
  console.log('Sending review request emails...');
  try {
    const emailCount = await BookingReviewService.sendReviewRequestEmails();
    console.log(`Sent ${emailCount} review request emails`);
  } catch (error) {
    console.error('Error sending review request emails:', error);
  }
});

// Start server
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

// Handle shutdown gracefully
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  try {
    await prisma.$disconnect();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown); 