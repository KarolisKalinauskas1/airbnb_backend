const { PrismaClient } = require('@prisma/client');

// Create a single PrismaClient instance
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' 
    ? ['error'] 
    : ['query', 'error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Test the connection
async function connect() {
  try {
    // Test the connection with a simple query
    await prisma.$connect();
    
    // Test the public schema
    await prisma.$queryRaw`SELECT 1`;
    
    console.log('Prisma connected successfully to Supabase');
  } catch (err) {
    console.error('Prisma connection error:', err);
    throw err;
  }
}

// Connect immediately and handle errors
connect()
  .then(() => {
    console.log('Database connection established');
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  });

// Handle process termination
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Export the PrismaClient instance
module.exports = prisma; 