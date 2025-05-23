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
        
        // Set up connection monitoring
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
        } else if (process.env.NODE_ENV === 'production') {
            console.error('Max retries reached but continuing in production mode');
            // Reset attempts to allow future retry cycles
            connectionAttempts = 0;
            setTimeout(connectWithRetry, RETRY_DELAY * 2);
        } else {
            console.error('Max retry attempts reached in development mode, exiting');
            process.exit(1);
        }
    }
}

// Start initial connection attempt
connectWithRetry();

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
cron.schedule('0 0 * * *', async () => {
  try {
    await BookingCompletionService.processCompletedBookings();
  } catch (error) {
    console.error('Error processing completed bookings:', error);
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
cron.schedule('0 11 * * *', async () => {
  try {
    await BookingReviewService.sendReviewRequestEmails();
  } catch (error) {
    console.error('Error sending review request emails:', error);
  }
});

// Start server with connection checks
function startServer() {
    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);

    // Add error event handler for the server
    server.on('error', (error) => {
        console.error('Server error:', error);
        if (error.code === 'EADDRINUSE') {
            console.log('Address in use, retrying in 5 seconds...');
            setTimeout(() => {
                server.close();
                server.listen(port);
            }, 5000);
        }
    });
}

// Start the server only after initial database connection in production
if (process.env.NODE_ENV === 'production') {
    const startTimeout = setTimeout(() => {
        console.log('Starting server without waiting for database (timeout reached)');
        startServer();
    }, 30000); // 30s timeout

    prisma.$connect()
        .then(() => {
            clearTimeout(startTimeout);
            console.log('Database connected, starting server');
            startServer();
        })
        .catch((error) => {
            console.warn('Starting server despite database connection failure:', error.message);
            startServer();
        });
} else {
    // In development, start immediately
    startServer();
}

// Handle shutdown gracefully
async function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Create a shutdown timeout
    const shutdownTimeout = setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000); // 10s timeout
    
    try {
        console.log('Closing HTTP server...');
        await new Promise((resolve) => {
            server.close(resolve);
        });
        
        console.log('Closing database connection...');
        await prisma.$disconnect();
        
        clearTimeout(shutdownTimeout);
        console.log('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown); 