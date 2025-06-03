const { PrismaClient } = require('@prisma/client');

// Initialize Prisma Client with logging enabled
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'minimal'
});

// Handle connection events
prisma.$on('error', e => {
  console.error('Prisma client error:', {
    message: e.message,
    code: e.code,
    clientVersion: e.clientVersion,
    meta: e.meta,
    target: e.target,
    timestamp: new Date().toISOString()
  });
});

// Handle connection termination
process.on('SIGINT', async () => {
  console.log('Received SIGINT - Closing Prisma connections...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM - Closing Prisma connections...');
  await prisma.$disconnect();
  process.exit(0);
});

async function ensureConnection() {
  try {
    console.log('Testing database connection...');
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection established');
    return true;
  } catch (error) {
    console.error('Database connection failed:', {
      error: error.message,
      code: error.code,
      meta: error.meta,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

module.exports = { prisma, ensureConnection };
