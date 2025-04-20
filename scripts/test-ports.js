#!/usr/bin/env node
/**
 * Database Port Tester
 * Tests different ports to find one that works with your Supabase database
 */
require('dotenv').config();
const net = require('net');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Function to extract connection info from DATABASE_URL
function parseDbUrl(url) {
  if (!url) {
    console.error('No DATABASE_URL provided');
    return null;
  }
  
  try {
    // Use regex to extract components
    const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/;
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
      params: match[6] || ''
    };
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
    return null;
  }
}

// Function to create a new DATABASE_URL with a different port
function createNewDbUrl(components, newPort) {
  return `postgres://${components.user}:${components.password}@${components.host}:${newPort}/${components.database}${components.params || ''}`;
}

// Function to test if a port is open
async function testPortConnection(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    console.log(`Testing connection to ${host}:${port}...`);
    
    const socket = new net.Socket();
    let isResolved = false;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      if (isResolved) return;
      isResolved = true;
      socket.destroy();
      resolve({ success: true, port });
    });
    
    socket.on('timeout', () => {
      if (isResolved) return;
      isResolved = true;
      socket.destroy();
      resolve({ success: false, reason: 'timeout', port });
    });
    
    socket.on('error', (error) => {
      if (isResolved) return;
      isResolved = true;
      socket.destroy();
      resolve({ success: false, reason: error.code, port });
    });
    
    // Attempt to connect
    socket.connect(port, host);
  });
}

// Function to test database connection with Prisma
async function testPrismaConnection(url, timeout = 5000) {
  return new Promise(async (resolve) => {
    try {
      console.log('Testing Prisma connection with:', url.replace(/:[^:]*@/, ':***@'));
      
      // Set a timeout
      const timeoutId = setTimeout(() => {
        resolve({ success: false, error: 'Connection attempt timed out' });
      }, timeout);
      
      // Create a new PrismaClient with the test URL
      const prisma = new PrismaClient({
        datasources: {
          db: { url }
        }
      });
      
      try {
        // Try to connect
        await prisma.$connect();
        
        // Test with a simple query
        await prisma.$queryRaw`SELECT 1 as test`;
        
        // Clean up and return success
        clearTimeout(timeoutId);
        await prisma.$disconnect();
        resolve({ success: true });
      } catch (error) {
        // Clean up and return error
        clearTimeout(timeoutId);
        try { await prisma.$disconnect(); } catch {}
        resolve({ success: false, error: error.message });
      }
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// Function to update .env file with new DATABASE_URL
function updateEnvFile(newUrl) {
  try {
    const envPath = path.join(__dirname, '../.env');
    const backupPath = path.join(__dirname, '../.env.backup');
    
    // Check if .env file exists
    if (!fs.existsSync(envPath)) {
      console.error('No .env file found to update');
      return false;
    }
    
    // Create a backup first
    fs.copyFileSync(envPath, backupPath);
    console.log(`Created backup of .env file at ${backupPath}`);
    
    // Read and modify the .env content
    let content = fs.readFileSync(envPath, 'utf8');
    
    if (content.includes('DATABASE_URL=')) {
      // Update existing DATABASE_URL
      content = content.replace(/DATABASE_URL=.*(\r?\n|$)/g, `DATABASE_URL="${newUrl}"$1`);
    } else {
      // Add DATABASE_URL if it doesn't exist
      content += `\nDATABASE_URL="${newUrl}"\n`;
    }
    
    // Write the updated content back to .env
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('Successfully updated .env file with new DATABASE_URL');
    return true;
  } catch (error) {
    console.error('Failed to update .env file:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('========= SUPABASE PORT CHECKER =========\n');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in your environment.');
    console.log('Please create or update your .env file with DATABASE_URL.');
    process.exit(1);
  }
  
  // Parse the DATABASE_URL
  const dbConfig = parseDbUrl(process.env.DATABASE_URL);
  if (!dbConfig) {
    console.error('Failed to parse DATABASE_URL.');
    process.exit(1);
  }
  
  console.log('Current database configuration:');
  console.log(`Host: ${dbConfig.host}`);
  console.log(`Port: ${dbConfig.port}`);
  console.log(`Database: ${dbConfig.database}`);
  console.log(`Username: ${dbConfig.user}`);
  console.log('');
  
  // Common ports to test
  const portsToTest = [
    dbConfig.port, // Try the current port first
    5432,          // Standard Postgres port
    5433,          // Alternative Postgres port
    5434,          // Another alternative port
    443,           // HTTPS port (sometimes works on restrictive networks)
    80             // HTTP port (sometimes works on restrictive networks)
  ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
  
  // Step 1: Test basic TCP connectivity to all ports
  console.log('Step 1: Testing TCP connectivity to different ports...\n');
  
  const tcpResults = [];
  for (const port of portsToTest) {
    const result = await testPortConnection(dbConfig.host, port);
    tcpResults.push(result);
    
    if (result.success) {
      console.log(`✅ Port ${port} is open`);
    } else {
      console.log(`❌ Port ${port} is not accessible (${result.reason})`);
    }
  }
  
  // Filter for open ports
  const openPorts = tcpResults.filter(r => r.success).map(r => r.port);
  
  if (openPorts.length === 0) {
    console.log('\n❌ No ports are accessible. This suggests a network connectivity issue.');
    console.log('Possible solutions:');
    console.log('1. Try using a different network (e.g., mobile hotspot instead of school/work network)');
    console.log('2. Check if a VPN or firewall is blocking database connections');
    process.exit(1);
  }
  
  console.log(`\nFound ${openPorts.length} accessible port(s): ${openPorts.join(', ')}`);
  
  // Step 2: Test actual database connections on open ports
  console.log('\nStep 2: Testing actual database connectivity on open ports...\n');
  
  for (const port of openPorts) {
    const testUrl = createNewDbUrl(dbConfig, port);
    const dbResult = await testPrismaConnection(testUrl);
    
    if (dbResult.success) {
      console.log(`✅ Successfully connected to database on port ${port}!`);
      
      // Ask if user wants to update .env file
      console.log('\nWould you like to update your .env file with this working connection? (y/n)');
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.once('data', (input) => {
        const response = input.toString().trim().toLowerCase();
        
        if (response === 'y' || response === 'yes') {
          if (updateEnvFile(testUrl)) {
            console.log('\n✅ .env file has been updated with the new DATABASE_URL.');
            console.log('Restart your application for changes to take effect.');
          }
        } else {
          console.log('\nTo manually update your DATABASE_URL, use:');
          console.log(testUrl.replace(/:[^:]*@/, ':***@'));
        }
        
        process.exit(0);
      });
      
      return;
    } else {
      console.log(`❌ Database connection failed on port ${port}: ${dbResult.error || 'Unknown error'}`);
    }
  }
  
  console.log('\n❌ Could not establish a database connection on any port.');
  console.log('This could be due to:');
  console.log('1. Wrong database credentials or database name');
  console.log('2. The database server rejecting connections from your current network');
  console.log('3. Database service may be down or restricted - check https://status.supabase.com/');
}

// Run the main function
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
