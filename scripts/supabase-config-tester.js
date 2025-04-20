#!/usr/bin/env node
/**
 * Supabase Configuration Tester
 * Tests different port configurations to find a working connection
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

function extractDatabaseInfo(url) {
  if (!url) return null;
  
  // Handle URL format with query parameters
  try {
    // Extract user:password@host:port/database from postgres://...
    const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(?:\?.*)?$/;
    const match = url.match(regex);
    
    if (!match) {
      throw new Error('Invalid DATABASE_URL format');
    }
    
    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4]),
      database: match[5],
      ssl: url.includes('sslmode=') ? url.includes('sslmode=require') : true
    };
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
    return null;
  }
}

function generateDatabaseUrl(info, port) {
  let url = `postgres://${info.user}:${info.password}@${info.host}:${port}/${info.database}`;
  if (info.ssl) {
    url += '?sslmode=require';
  }
  return url;
}

async function testDatabaseConnection(url) {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url
      }
    },
    log: ['error']
  });
  
  try {
    console.log(`Testing connection to ${url.replace(/:[^:]*@/, ':****@')}`);
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1 as result`;
    await prisma.$disconnect();
    return { success: true };
  } catch (error) {
    await prisma.$disconnect();
    return { 
      success: false, 
      error: error.message 
    };
  }
}

function backupEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  const backupPath = path.join(process.cwd(), '.env.backup');
  
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, backupPath);
    console.log(`Backed up .env file to ${backupPath}`);
  }
}

function updateEnvFile(newUrl) {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('No .env file found to update');
    return false;
  }
  
  try {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Replace or add DATABASE_URL
    if (envContent.includes('DATABASE_URL=')) {
      envContent = envContent.replace(
        /DATABASE_URL=.*/,
        `DATABASE_URL="${newUrl}"`
      );
    } else {
      envContent += `\nDATABASE_URL="${newUrl}"\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('Updated DATABASE_URL in .env file');
    return true;
  } catch (error) {
    console.error('Failed to update .env file:', error);
    return false;
  }
}

async function main() {
  console.log('======= SUPABASE CONNECTION TESTER =======\n');
  
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not found in environment variables');
    return;
  }
  
  const dbInfo = extractDatabaseInfo(url);
  if (!dbInfo) {
    console.error('Failed to parse DATABASE_URL');
    return;
  }
  
  console.log(`Original database host: ${dbInfo.host}`);
  console.log(`Original database port: ${dbInfo.port}`);
  
  // Ports to test
  const portsToTest = [
    dbInfo.port, // Original port first
    5432,        // Standard Postgres port
    6543,        // Supabase connection pooler
    5433,        // Alternative Postgres port
    443,         // HTTPS port - some networks allow only web traffic
  ];
  
  console.log(`\nTesting ${portsToTest.length} different port configurations...`);
  
  // Test each port
  const results = [];
  for (const port of portsToTest) {
    const testUrl = generateDatabaseUrl(dbInfo, port);
    const result = await testDatabaseConnection(testUrl);
    results.push({
      port,
      success: result.success,
      error: result.error,
      url: testUrl
    });
    
    if (result.success) {
      console.log(`✅ Connection successful on port ${port}`);
    } else {
      console.log(`❌ Connection failed on port ${port}: ${result.error}`);
    }
  }
  
  // Find the first successful configuration
  const successfulConfig = results.find(r => r.success);
  
  if (successfulConfig) {
    console.log(`\n✅ Found working configuration using port ${successfulConfig.port}!`);
    
    if (successfulConfig.port !== dbInfo.port) {
      console.log('\nWould you like to update your .env file with this configuration? (y/n)');
      process.stdout.write('> ');
      
      process.stdin.once('data', (data) => {
        const input = data.toString().trim().toLowerCase();
        
        if (input === 'y' || input === 'yes') {
          // Backup the .env file first
          backupEnvFile();
          
          // Update the .env file
          if (updateEnvFile(successfulConfig.url)) {
            console.log('\n✅ Your database configuration has been updated.');
            console.log('Restart your application to use the new configuration.');
          }
        } else {
          console.log('\nTo manually update your configuration, set DATABASE_URL to:');
          console.log(successfulConfig.url.replace(/:[^:]*@/, ':****@'));
        }
        
        process.exit(0);
      });
    } else {
      console.log('\nYour current configuration is working correctly.');
    }
  } else {
    console.log('\n❌ Could not find a working configuration.');
    console.log('\nPossible reasons:');
    console.log('1. Your network is blocking all database connections');
    console.log('2. The database server is not accepting connections');
    console.log('3. Authentication credentials are incorrect');
    
    console.log('\nPossible solutions:');
    console.log('1. Try connecting from a different network (e.g., mobile hotspot)');
    console.log('2. Check if your Supabase project is active at https://supabase.com/dashboard');
    console.log('3. Use the offline development mode for your application');
    
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
