#!/usr/bin/env node
/**
 * Database Connection Troubleshooter and Fixer
 * 
 * This script helps diagnose and fix database connection issues for Railway deployment.
 * It checks DATABASE_URL, performs connection tests, and suggests fixes.
 * 
 * Run with: node scripts/fix-database-connection.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const readline = require('readline');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Track if we need to perform fixes
let needsFixes = false;

async function main() {
  console.log(`${colors.cyan}===== DATABASE CONNECTION TROUBLESHOOTER =====\n${colors.reset}`);
  console.log(`This tool will help diagnose and fix database connection issues.`);
  
  // Check environment variables
  console.log(`\n${colors.blue}1. Checking environment variables...${colors.reset}`);
  
  if (!process.env.DATABASE_URL) {
    console.log(`${colors.red}✖ DATABASE_URL is not set${colors.reset}`);
    needsFixes = true;
  } else {
    // Validate DATABASE_URL format
    const dbUrlPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
    const matches = process.env.DATABASE_URL.match(dbUrlPattern);
    
    if (!matches) {
      console.log(`${colors.red}✖ DATABASE_URL format is invalid${colors.reset}`);
      console.log(`  Format should be: postgresql://USER:PASSWORD@HOST:PORT/DATABASE`);
      needsFixes = true;
    } else {
      console.log(`${colors.green}✓ DATABASE_URL format is valid${colors.reset}`);
      
      const [_, user, pass, host, port, database] = matches;
      console.log(`  • User: ${user}`);
      console.log(`  • Password: ${'*'.repeat(Math.min(pass.length, 5))}...`);
      console.log(`  • Host: ${host}`);
      console.log(`  • Port: ${port}`);
      console.log(`  • Database: ${database}`);
      
      // Check DIRECT_URL
      if (!process.env.DIRECT_URL) {
        console.log(`${colors.yellow}! DIRECT_URL is not set. Using DATABASE_URL as fallback.${colors.reset}`);
      }
    }
  }
  
  // Test database connection
  console.log(`\n${colors.blue}2. Testing database connection...${colors.reset}`);
  
  const prisma = new PrismaClient({
    log: ['error'],
    errorFormat: 'minimal'
  });
  
  try {
    // Try a simple query with timeout
    console.log(`${colors.yellow}Attempting to connect to database...${colors.reset}`);
    
    await Promise.race([
      prisma.$queryRaw`SELECT 1 as result`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000))
    ]);
    
    console.log(`${colors.green}✓ Successfully connected to the database!${colors.reset}`);
    
    // Try a query to public_users table
    try {
      console.log(`${colors.yellow}Checking access to public_users table...${colors.reset}`);
      
      const userCount = await prisma.public_users.count();
      console.log(`${colors.green}✓ Successfully accessed public_users table (${userCount} users found)${colors.reset}`);
    } catch (tableError) {
      console.log(`${colors.red}✖ Error accessing public_users table: ${tableError.message}${colors.reset}`);
      needsFixes = true;
    }
  } catch (error) {
    console.log(`${colors.red}✖ Database connection failed: ${error.message}${colors.reset}`);
    needsFixes = true;
  } finally {
    await prisma.$disconnect();
  }
  
  // If fixes are needed, offer solutions
  if (needsFixes) {
    console.log(`\n${colors.magenta}===== RECOMMENDED FIXES =====\n${colors.reset}`);
    
    console.log(`1. ${colors.yellow}Enable mock user data for development/testing${colors.reset}`);
    console.log(`   This allows the frontend to function even when the database connection fails:`);
    console.log(`   • Run: railway variables set ALLOW_MOCK_USER=true`);
    console.log(`   • This will return mock user data for /api/users/me endpoint\n`);
    
    console.log(`2. ${colors.yellow}Verify DATABASE_URL in Railway${colors.reset}`);
    console.log(`   • Log into Railway dashboard`);
    console.log(`   • Check the environment variables for your project`);
    console.log(`   • Make sure DATABASE_URL is set to a valid PostgreSQL connection string\n`);
    
    console.log(`3. ${colors.yellow}Test connection from Railway CLI${colors.reset}`);
    console.log(`   • Run: railway run node scripts/check-db-connection.js`);
    console.log(`   • This will test the connection from within the Railway environment\n`);
    
    const proceed = await askQuestion(`${colors.cyan}Would you like to enable mock user data now? (y/n)${colors.reset} `);
    
    if (proceed.toLowerCase() === 'y') {
      try {
        console.log(`\n${colors.blue}Setting ALLOW_MOCK_USER=true in Railway...${colors.reset}`);
        execSync('railway variables set ALLOW_MOCK_USER=true', { stdio: 'inherit' });
        console.log(`\n${colors.green}✓ Successfully set ALLOW_MOCK_USER=true${colors.reset}`);
        
        const deploy = await askQuestion(`${colors.cyan}Would you like to redeploy the application now? (y/n)${colors.reset} `);
        
        if (deploy.toLowerCase() === 'y') {
          console.log(`\n${colors.blue}Deploying to Railway...${colors.reset}`);
          execSync('railway up', { stdio: 'inherit' });
        }
      } catch (error) {
        console.log(`\n${colors.red}Error setting Railway variables: ${error.message}${colors.reset}`);
        console.log(`You may need to set the variables manually in the Railway dashboard.`);
      }
    }
  } else {
    console.log(`\n${colors.green}✓ No major database connection issues detected!${colors.reset}`);
  }
  
  rl.close();
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

main().catch(error => {
  console.error(`${colors.red}Error running database troubleshooter:${colors.reset}`, error);
  rl.close();
  process.exit(1);
});
