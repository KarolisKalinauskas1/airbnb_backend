const { spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const sleep = promisify(setTimeout);

async function waitForDatabase(maxRetries = 10, backoffMs = 1000) {
  const prisma = require('@prisma/client');
  const client = new prisma.PrismaClient();
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.$connect();
      console.log('Successfully connected to database');
      await client.$disconnect();
      return true;
    } catch (error) {
      console.log(`Database connection attempt ${i + 1}/${maxRetries} failed:`, error.message);
      await sleep(backoffMs * Math.pow(2, i)); // Exponential backoff
    }
  }
  return false;
}

async function main() {
  try {
    // Ensure we're in the app root directory
    process.chdir(path.join(__dirname, '..'));

    // Wait for database to be available
    console.log('Checking database connection...');
    if (!await waitForDatabase()) {
      throw new Error('Could not connect to database after multiple retries');
    }

    // Run Prisma migrations
    console.log('Running database migrations...');
    await new Promise((resolve, reject) => {
      const migrate = spawn('npx', ['prisma', 'migrate', 'deploy'], {
        stdio: 'inherit'
      });
      
      migrate.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Migration failed with code ${code}`));
      });
    });

    // Start the server
    console.log('Starting server...');
    const server = spawn('node', ['src/server.js'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });

    server.on('close', code => {
      if (code !== 0) {
        console.error(`Server exited with code ${code}`);
        process.exit(code);
      }
    });
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

main();
