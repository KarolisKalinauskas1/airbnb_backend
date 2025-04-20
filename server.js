#!/usr/bin/env node
/**
 * Backend Startup Script with Enhanced Error Handling
 */

// Make sure we're loading environment variables early
require('dotenv').config();
console.log('Loading environment variables...');

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
  console.error('Please make sure your .env file exists and contains DATABASE_URL.');
  process.exit(1);
}

const app = require('./app');
const http = require('http');
const debug = require('debug')('airbnb-backend:server');
const db = require('./config/database');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

/**
 * Get port from environment and store in Express.
 */
const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */
const server = http.createServer(app);

// Extract database host from DATABASE_URL for diagnostics
function extractDatabaseHost() {
  try {
    if (!process.env.DATABASE_URL) return null;
    const matches = process.env.DATABASE_URL.match(/postgres:\/\/.*?@([^:]+):(\d+)/);
    return matches ? { host: matches[1], port: matches[2] } : null;
  } catch (err) {
    console.error('Failed to parse DATABASE_URL:', err.message);
    return null;
  }
}

/**
 * Start server and attempt database connection, but don't make it critical for startup
 */
async function startServer() {
  try {
    console.log('Starting server...');
    
    // Listen on provided port, on all network interfaces first
    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);
    
    console.log(`\nServer started on port ${port}`);
    console.log(`API is available at: http://localhost:${port}/api`);
    console.log(`Health check is available at: http://localhost:${port}/health`);
    
    // Now test database connection in the background
    console.log('\nTesting database connection...');
    
    // Check if .env file exists (for diagnostics)
    const envPath = path.join(__dirname, '.env');
    const envExists = fs.existsSync(envPath);
    console.log(`.env file ${envExists ? 'exists' : 'DOES NOT EXIST'}`);
    
    // Print masked URL
    const maskedUrl = process.env.DATABASE_URL 
      ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@') 
      : 'NOT SET';
    console.log('DATABASE_URL:', maskedUrl);
    
    // DNS resolution test for the database host
    const dbInfo = extractDatabaseHost();
    if (dbInfo) {
      console.log(`Testing connection to ${dbInfo.host}:${dbInfo.port}...`);
      
      // Test DNS resolution
      try {
        const { address } = await dns.lookup(dbInfo.host);
        console.log(`✅ DNS resolution successful: ${dbInfo.host} -> ${address}`);
      } catch (dnsError) {
        console.error(`❌ DNS resolution failed: ${dnsError.message}`);
        console.log('This suggests a network connectivity issue or incorrect hostname.');
      }
    }
    
    try {
      // Set a timeout for the database connection test
      const connectionPromise = db.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timed out')), 10000)
      );
      
      await Promise.race([connectionPromise, timeoutPromise]);
      console.log('✅ Database connection established successfully');
      
      // Set up listeners for database events
      db.on('disconnected', () => {
        console.log('❌ Database connection lost - will attempt to reconnect');
        global.databaseConnected = false;
      });
      
      db.on('connected', () => {
        console.log('✅ Database connection re-established');
        global.databaseConnected = true;
      });
      
      global.databaseConnected = true;
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
      console.log('\nServer will continue running with limited functionality.');
      console.log('Some API endpoints that require database access will return error responses.');
      console.log('\nPossible solutions:');
      console.log('1. Check if your DATABASE_URL in .env is correct');
      console.log('2. Ensure Supabase is up and running: https://status.supabase.com/');
      console.log('3. Check if your network allows outbound connections to the database');
      console.log('4. Try connecting from a different network (some networks block DB ports)');
      console.log('5. Try modifying the port in your DATABASE_URL (e.g. 5432 instead of 6543)');
      
      global.databaseConnected = false;
      
      // Schedule periodic reconnection attempts
      scheduleReconnect();
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Try to reconnect to the database periodically
function scheduleReconnect() {
  const interval = 30000; // Try every 30 seconds
  console.log(`\nScheduling database reconnection attempt in ${interval/1000} seconds...`);
  
  setTimeout(async () => {
    console.log('Attempting to reconnect to database...');
    
    try {
      await db.connect();
      console.log('✅ Database reconnection successful!');
      global.databaseConnected = true;
    } catch (error) {
      console.error('❌ Database reconnection failed:', error.message);
      global.databaseConnected = false;
      // Schedule another attempt
      scheduleReconnect();
    }
  }, interval);
}

startServer().catch(error => {
  console.error('Uncaught error during server startup:', error);
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
  
  console.log('🚀 Server listening on ' + bind);
}
