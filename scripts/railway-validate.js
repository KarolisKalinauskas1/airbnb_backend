#!/usr/bin/env node

// Script to validate Railway environment and check configuration
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Colorize console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}=== Railway Deployment Validation ====${colors.reset}`);

// Required environment variables with descriptions
const requiredVars = {
  'DATABASE_URL': 'PostgreSQL connection string',
  'DIRECT_URL': 'Direct database connection URL',
  'JWT_SECRET': 'Secret key for JWT tokens',
  'CORS_ORIGIN': 'Frontend URL for CORS',
  'SUPABASE_URL': 'Supabase URL',
  'SUPABASE_ANON_KEY': 'Supabase anonymous key',
  'NODE_ENV': 'Environment (development/production)'
};

// Check for missing variables
let missingVars = [];
for (const [name, description] of Object.entries(requiredVars)) {
  if (!process.env[name]) {
    missingVars.push({ name, description });
  }
}

if (missingVars.length > 0) {
  console.log(`${colors.red}Missing environment variables:${colors.reset}`);
  missingVars.forEach(({ name, description }) => {
    console.log(`${colors.yellow}${name}${colors.reset}: ${description}`);
  });
} else {
  console.log(`${colors.green}✓ All required environment variables are set${colors.reset}`);
}

// Check database connection
async function checkDatabase() {
  try {
    console.log(`${colors.blue}Testing database connection...${colors.reset}`);
    
    // Try to import PrismaClient
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Test connection with a simple query and timeout
    const connectPromise = prisma.$queryRaw`SELECT 1 as connected`;
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 5000)
    );
    
    const result = await Promise.race([connectPromise, timeout]);
    
    if (result[0]?.connected === 1) {
      console.log(`${colors.green}✓ Database connection successful${colors.reset}`);
    } else {
      console.log(`${colors.red}× Database query returned unexpected result${colors.reset}`);
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.log(`${colors.red}× Database connection failed: ${error.message}${colors.reset}`);
    console.log(`${colors.yellow}Database URL format: ${process.env.DATABASE_URL?.substring(0, 15)}...${colors.reset}`);
  }
}

// Check Supabase connection
async function checkSupabase() {
  try {
    console.log(`${colors.blue}Testing Supabase connection...${colors.reset}`);
    
    // Create Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    
    // Test the connection with a basic auth query
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.log(`${colors.red}× Supabase connection error: ${error.message}${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ Supabase connection successful${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}× Supabase connection failed: ${error.message}${colors.reset}`);
  }
}

// Check CORS configuration
async function checkCORS() {
  try {
    console.log(`${colors.blue}Testing CORS configuration...${colors.reset}`);
    
    // Parse CORS_ORIGIN
    const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || [];
    
    if (corsOrigins.length === 0) {
      console.log(`${colors.yellow}! No CORS origins defined${colors.reset}`);
      return;
    }
    
    // Log the configured origins
    console.log(`${colors.cyan}Configured CORS origins:${colors.reset}`);
    corsOrigins.forEach(origin => {
      console.log(`  - ${origin}`);
    });
    
    // Check if CORS allows the Vercel frontend
    const vercelOrigin = 'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app';
    const isVercelAllowed = corsOrigins.includes('*') || 
                           corsOrigins.includes(vercelOrigin) || 
                           corsOrigins.some(o => o.includes('*.vercel.app'));
    
    if (isVercelAllowed) {
      console.log(`${colors.green}✓ Vercel frontend is allowed by CORS${colors.reset}`);
    } else {
      console.log(`${colors.red}× Vercel frontend may not be allowed by CORS${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.red}× CORS check failed: ${error.message}${colors.reset}`);
  }
}

// Run all checks
async function runChecks() {
  console.log(`${colors.magenta}Running environment checks...${colors.reset}`);
  
  await checkDatabase();
  await checkSupabase();
  await checkCORS();
  
  console.log(`${colors.cyan}=== Validation complete ====${colors.reset}`);
}

runChecks().catch(error => {
  console.error(`${colors.red}Error running checks: ${error.message}${colors.reset}`);
  process.exit(1);
});
