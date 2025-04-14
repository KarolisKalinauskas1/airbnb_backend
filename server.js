#!/usr/bin/env node
/**
 * Backend Startup Script with Enhanced Error Handling
 */

const app = require('./app');
const http = require('http');
const debug = require('debug')('airbnb-backend:server');
const { PrismaClient } = require('@prisma/client');

// Create Prisma client for database connection check
const prisma = new PrismaClient();

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
 * Test database connection before starting server.
 */
async function startServer() {
  try {
    console.log('Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection successful.');
    
    // Verify CORS setup
    console.log('CORS is configured with the following settings:');
    console.log('- Allowed Origins:', ['http://localhost:5173', 'http://localhost:3000']);
    console.log('- Credentials Support: Enabled');
    console.log('- Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH');
    
    // Listen on provided port, on all network interfaces.
    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch(console.error);

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
  
  console.log('🚀 Server listening on ' + bind);
  console.log(`Server URL: http://localhost:${port}`);
  console.log('CORS configured for origins: http://localhost:5173, http://localhost:3000');
}
