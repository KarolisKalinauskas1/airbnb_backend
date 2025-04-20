#!/usr/bin/env node
/**
 * Tries connecting to Supabase using different ports
 * Use this if the default port (6543) is blocked
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Parse DATABASE_URL
function parseDbUrl(url) {
  try {
    // Extract components from postgres://username:password@hostname:port/database
    const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    
    if (!match) {
      throw new Error('Could not parse DATABASE_URL');
    }
    
    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4]),
      database: match[5],
      sslmode: url.includes('sslmode=require') ? 'require' : 'prefer'
    };
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
    process.exit(1);
  }
}

// Create a new DATABASE_URL with a different port
function createNewDbUrl(components, newPort) {
  return `postgres://${components.user}:${components.password}@${components.host}:${newPort}/${components.database}?sslmode=${components.sslmode}`;
}

// Test if a port is accessible
async function testPort(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    
    socket.setTimeout(timeoutMs);
    
    socket.on('connect', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ success: true });
    });
    
    socket.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ success: false, reason: 'timeout' });
    });
    
    socket.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ success: false, reason: error.code });
    });
    
    socket.connect(port, host);
  });
}

// Test database connection with a specific URL
async function testConnection(url) {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url
      }
    }
  });
  
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1 as result`;
    await prisma.$disconnect();
    return { success: true };
  } catch (error) {
    try {
      await prisma.$disconnect();
    } catch {}
    return { success: false, error: error.message };
  }
}

// Update .env file with new DATABASE_URL
function updateEnvFile(newUrl) {
  const envPath = path.join(__dirname, '..', '.env');
  
  try {
    let content = '';
    
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
      
      // Replace existing DATABASE_URL
      if (content.includes('DATABASE_URL=')) {
        content = content.replace(/DATABASE_URL=.*(\r?\n|$)/g, `DATABASE_URL="${newUrl}"$1`);
      } else {
        content += `\nDATABASE_URL="${newUrl}"\n`;
      }
    } else {
      content = `DATABASE_URL="${newUrl}"\n`;
    }
    
    // Backup existing .env first
    if (fs.existsSync(envPath)) {
      fs.copyFileSync(envPath, `${envPath}.backup`);
      console.log(`✅ Backed up existing .env file to ${envPath}.backup`);
    }
    
    // Write new content
    fs.writeFileSync(envPath, content, 'utf8');
    console.log(`✅ Updated .env file with working DATABASE_URL`);
    
    return true;
  } catch (error) {
    console.error('Failed to update .env file:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('\n=== SUPABASE DATABASE CONNECTION TESTER ===\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set.');
    console.log('Please ensure your .env file exists and contains DATABASE_URL.');
    process.exit(1);
  }
  
  // Parse the current DATABASE_URL
  const dbComponents = parseDbUrl(process.env.DATABASE_URL);
  const originalPort = dbComponents.port;
  
  console.log(`Current database config:`);
  console.log(`- Host: ${dbComponents.host}`);
  console.log(`- Port: ${dbComponents.port}`);
  console.log(`- Database: ${dbComponents.database}`);
  console.log(`- User: ${dbComponents.user}`);
  console.log(`- SSL Mode: ${dbComponents.sslmode}`);
  
  // Test the current configuration first
  console.log('\nTesting current connection...');
  const currentResult = await testConnection(process.env.DATABASE_URL);
  
  if (currentResult.success) {
    console.log('✅ Current configuration works correctly!');
    return;
  }
  
  console.log(`❌ Current configuration failed: ${currentResult.error}`);
  
  // Ports to try
  const portsToTry = [5432, 5433, 6543, 5434, 5431, 443];
  // Remove the current port from the list to avoid duplication
  const alternativePorts = portsToTry.filter(p => p !== originalPort);
  
  console.log('\nTesting alternative ports...');
  
  // First test port accessibility
  console.log('\nChecking port accessibility:');
  const portResults = [];
  
  for (const port of alternativePorts) {
    process.stdout.write(`Testing port ${port}... `);
    const result = await testPort(dbComponents.host, port);
    if (result.success) {
      console.log('✅ Accessible');
      portResults.push({ port, accessible: true });
    } else {
      console.log(`❌ Not accessible (${result.reason || 'unknown error'})`);
      portResults.push({ port, accessible: false, reason: result.reason });
    }
  }
  
  // Filter to accessible ports and test actual connections
  const accessiblePorts = portResults.filter(r => r.accessible).map(r => r.port);
  
  if (accessiblePorts.length === 0) {
    console.log('\n❌ No alternative ports are accessible.');
    console.log('This suggests a network issue blocking connections to the database server.');
    console.log('\nPossible solutions:');
    console.log('1. Try connecting from a different network (e.g., mobile hotspot)');
    console.log('2. Check with your network administrator if database ports are blocked');
    console.log('3. Check if Supabase is operational at https://status.supabase.com');
    return;
  }
  
  console.log(`\nFound ${accessiblePorts.length} accessible ports. Testing actual database connections...`);
  
  for (const port of accessiblePorts) {
    const newUrl = createNewDbUrl(dbComponents, port);
    process.stdout.write(`Testing connection on port ${port}... `);
    
    const result = await testConnection(newUrl);
    
    if (result.success) {
      console.log('✅ Success!');
      
      console.log(`\n✅ Found working configuration with port ${port}!`);
      console.log('\nWould you like to update your .env file with this configuration? (y/n)');
      
      // Use standard input to get user response
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();
        
        if (answer === 'y' || answer === 'yes') {
          if (updateEnvFile(newUrl)) {
            console.log('\nDone! Restart your application to use the new configuration.');
          }
        } else {
          console.log('\nTo manually update your DATABASE_URL, use this connection string:');
          const maskedUrl = newUrl.replace(/:[^:]*@/, ':***@');
          console.log(maskedUrl);
        }
        
        process.exit(0);
      });
      
      return;
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
  }
  
  console.log('\n❌ Could not find a working database configuration.');
  console.log('\nPossible issues:');
  console.log('1. The database server might be down');
  console.log('2. Your credentials may be incorrect');
  console.log('3. Your Supabase project might be paused or restricted');
  
  console.log('\nPlease check your Supabase dashboard and status at https://status.supabase.com');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
