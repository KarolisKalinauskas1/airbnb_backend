const { PrismaClient } = require('@prisma/client');

// Create a single PrismaClient instance with logging
const globalForPrisma = global;

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production' 
      ? ['error'] 
      : ['query', 'error', 'warn'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    },
    errorFormat: 'pretty'
  });
}

// Use the existing Prisma instance if it exists
const prisma = globalForPrisma.prisma;

// Handle process termination events for cleanup
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit();
});

// Export the Prisma instance
module.exports = prisma;