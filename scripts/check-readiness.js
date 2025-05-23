const { PrismaClient } = require('@prisma/client');
const http = require('http');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

async function checkDatabaseConnection(maxRetries = 5) {
  const prisma = new PrismaClient();
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      console.log('Database connection successful');
      await prisma.$disconnect();
      return true;
    } catch (error) {
      console.log(`Database connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
      if (i < maxRetries - 1) await sleep(2000);
    }
  }
  return false;
}

async function main() {
  try {
    // Check port availability
    const port = process.env.PORT || 3000;
    if (!await isPortAvailable(port)) {
      console.error(`Port ${port} is not available`);
      process.exit(1);
    }

    // Check database connection
    if (!await checkDatabaseConnection()) {
      console.error('Could not establish database connection');
      process.exit(1);
    }

    console.log('All checks passed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Readiness check failed:', error);
    process.exit(1);
  }
}

main();