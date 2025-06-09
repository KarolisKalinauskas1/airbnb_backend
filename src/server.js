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

// Handle Prisma connection with retry logic
let isDbConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

async function connectWithRetry() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to database');
    isDbConnected = true;
    connectionAttempts = 0;
    
    // Once connected, start the server
    startServer();
    
    // Monitor database connection
    setInterval(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        console.error('Database connection check failed:', error);
        isDbConnected = false;
        connectWithRetry();
      }
    }, 30000); // Check every 30 seconds
  } catch (error) {
    connectionAttempts++;
    console.error(`Failed to connect to database (attempt ${connectionAttempts}/${MAX_RETRIES}):`, error);
    
    if (connectionAttempts < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
      setTimeout(connectWithRetry, RETRY_DELAY);
    } else {
      console.error('Max retries reached. Server startup failed.');
      process.exit(1);
    }
  }
}

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
}

// Schedule the booking completion check to run daily at midnight
console.log('[CRON] Scheduling booking completion check for daily at midnight (0 0 * * *)');
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running scheduled booking completion check at:', new Date().toISOString());
  try {
    await BookingCompletionService.processCompletedBookings();
    console.log('[CRON] Booking completion check completed successfully');
  } catch (error) {
    console.error('[CRON] Error processing completed bookings:', error);
  }
});

// Schedule booking reminders to run daily at 10:00 AM
cron.schedule('0 10 * * *', async () => {
  try {
    await ReminderService.sendBookingReminders();
  } catch (error) {
    console.error('Error sending booking reminders:', error);
  }
});

// Schedule payment reminders to run every 6 hours
cron.schedule('0 */6 * * *', async () => {
  try {
    await ReminderService.sendPaymentReminders();
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
console.log('[CRON] Scheduling review request emails for daily at 11:00 AM (0 11 * * *)');
cron.schedule('0 11 * * *', async () => {
  console.log('[CRON] Running scheduled review request emails at:', new Date().toISOString());
  try {
    await BookingReviewService.sendReviewRequestEmails();
    console.log('[CRON] Review request emails completed successfully');
  } catch (error) {
    console.error('[CRON] Error sending review request emails:', error);
  }
});

// Test cron job to verify cron system is working (runs every minute in development)
if (process.env.NODE_ENV === 'development') {
  console.log('[CRON] Scheduling test cron job for every minute (* * * * *)');
  cron.schedule('* * * * *', () => {
    console.log('[CRON-TEST] Test cron job executed at:', new Date().toISOString());
  });
}

function startServer() {
  server.listen(port, process.env.HOST || 'localhost', () => {
    console.log(`Server running at http://${process.env.HOST || 'localhost'}:${port}`);
  });
}

// Start the connection process
connectWithRetry();

// Error handling for the server
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // Handle specific listen errors with friendly messages
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
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});