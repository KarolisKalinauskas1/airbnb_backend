/**
 * Run this script to check if your environment is properly set up
 * 
 * Usage: node setup-check.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('Environment Setup Check');
console.log('======================');

// Check required environment variables
const requiredEnvVars = [
  'SUPABASE_URL', 
  'SUPABASE_KEY', 
  'STRIPE_SECRET_KEY'
];

let missingVars = [];
requiredEnvVars.forEach(variable => {
  if (!process.env[variable]) {
    missingVars.push(variable);
  }
});

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(variable => {
    console.error(`   - ${variable}`);
  });
  
  // Check if .env file exists
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('\n❌ No .env file found!');
    console.error('   Please create a .env file in the backend directory with the following variables:');
    requiredEnvVars.forEach(variable => {
      console.error(`   ${variable}=your_${variable.toLowerCase()}_here`);
    });
  } else {
    console.error('\n⚠️ .env file exists but is missing some variables.');
    console.error('   Please update your .env file with the missing variables.');
  }
} else {
  console.log('✅ All required environment variables are set.');
}

// Check if Prisma schema exists
const prismaSchemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
if (fs.existsSync(prismaSchemaPath)) {
  console.log('✅ Prisma schema found.');
} else {
  console.error('❌ Prisma schema not found at:', prismaSchemaPath);
}

// Check auth middleware
console.log('\nChecking auth middleware...');
try {
  const authenticate = require('./middleware/auth');
  console.log('✅ Auth middleware loaded successfully.');
} catch (error) {
  console.error('❌ Error loading auth middleware:', error.message);
}

// Check database connection
console.log('\nChecking database connection...');
try {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  async function testConnection() {
    try {
      // Try a simple query
      await prisma.$queryRaw`SELECT 1 as result`;
      console.log('✅ Database connection successful.');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
    } finally {
      await prisma.$disconnect();
    }
  }
  
  testConnection();
} catch (error) {
  console.error('❌ Error initializing Prisma client:', error.message);
}

console.log('\nSetup check complete. Fix any issues reported above.');
