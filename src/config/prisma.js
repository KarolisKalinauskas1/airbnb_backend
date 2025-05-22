const { PrismaClient } = require('@prisma/client');

// Create a single PrismaClient instance with improved connection settings
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' 
    ? ['error'] 
    : ['query', 'error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Add connection pool configuration with values from env or defaults
  // Increase the connection timeout and reduce connection limit
  __internal: {
    engine: {
      connectionLimit: parseInt(process.env.DATABASE_CONNECTION_LIMIT || '5'), 
      connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '30000'),
      queueTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '10000'),
    }
  }
});

// For production, disable verbose connection logging
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', e => {
    console.log('Query: ' + e.query);
    console.log('Duration: ' + e.duration + 'ms');
  });
}

prisma.$on('error', e => {
  console.error('Prisma error event:', e);
});

// Implement a more robust connection handling
let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 3;

// Test the connection with retry mechanism - modified for serverless
async function connect() {
  try {
    connectionAttempts++;
    // Test the connection with a simple query
    await prisma.$connect();
    
    // Test the public schema (with timeout for serverless)
    const connectPromise = prisma.$queryRaw`SELECT 1`;
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 5000)
    );
    
    await Promise.race([connectPromise, timeout]);
    
    console.log('Prisma connected successfully to database');
    isConnected = true;
    connectionAttempts = 0;
    return true;  } catch (err) {
    console.error(`Prisma connection error (attempt ${connectionAttempts}/${MAX_RETRIES}):`, err);
    
    if (connectionAttempts < MAX_RETRIES) {
      console.log(`Retrying connection in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connect();
    }
    
    // In serverless environments, we should fail gracefully
    if (process.env.NODE_ENV === 'production') {
      console.error('Failed to connect to database in serverless environment. Check DATABASE_URL and network settings.');
      // Log more details about the connection attempt
      console.error('Connection details:', {
        host: process.env.DATABASE_HOST || 'not-set',
        database: process.env.DATABASE_NAME || 'not-set',
        port: process.env.DATABASE_PORT || 'not-set',
        user: process.env.DATABASE_USER ? 'set' : 'not-set',
        url_format: process.env.DATABASE_URL ? 'postgresql://user:pass@host:port/db' : 'not-set'
      });
      isConnected = false;
      return false;
    } else {
      throw err;
    }
  }
}

// Connect immediately and handle errors
connect()
  .then(() => {
    console.log('Database connection established');
  })
  .catch((err) => {
    console.error('Failed to connect to database after multiple attempts:', err);
    // Don't exit - allow the app to start even if DB connection fails initially
    // It will attempt reconnection when needed
  });

// Handle process termination - ensure proper disconnection
process.on('beforeExit', async () => {
  console.log('Process exiting, disconnecting Prisma...');
  await prisma.$disconnect();
});

// Handle uncaught exceptions and rejections
process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err);
  await prisma.$disconnect();
});

process.on('unhandledRejection', async (err) => {
  console.error('Unhandled rejection:', err);
  // Don't disconnect here, as it might be related to the Prisma connection itself
});

// Export our reconnection function to be used by the app middleware
// This allows reconnection attempts during request handling
async function ensureConnection() {
  if (!isConnected) {
    return connect();
  }
  return true;
}

// Export both the PrismaClient instance and the connection helper
module.exports = prisma;
module.exports.ensureConnection = ensureConnection;