#!/usr/bin/env node
/**
 * Enhanced database connection diagnostics tool
 * This tool performs extensive tests to diagnose database connection issues
 */
require('dotenv').config();
const { exec } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const net = require('net');
const dns = require('dns').promises;

// Extract database URL components
function parseDatabaseUrl(url) {
  if (!url) {
    return null;
  }
  
  // Handle URL format with query parameters
  try {
    const regex = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(?:\?.*)?$/;
    const matches = url.match(regex);
    
    if (!matches) {
      throw new Error('Invalid DATABASE_URL format');
    }
    
    return {
      user: matches[1],
      password: matches[2],
      host: matches[3],
      port: parseInt(matches[4]),
      database: matches[5],
      ssl: url.includes('sslmode=') ? url.includes('sslmode=require') : true
    };
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error.message);
    return null;
  }
}

// Execute command with promise
function execCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        output: stdout || stderr,
        error: error
      });
    });
  });
}

// Check if a host can be resolved via DNS
async function checkDnsResolution(hostname) {
  try {
    const result = await dns.lookup(hostname);
    return {
      success: true,
      address: result.address,
      family: `IPv${result.family}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Test TCP connection to a host:port
function testTcpConnection(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    
    // Set timeout
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
      resolve({ 
        success: false, 
        error: `Connection timed out after ${timeoutMs}ms` 
      });
    });
    
    socket.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ 
        success: false, 
        error: error.message 
      });
    });
    
    // Attempt to connect
    socket.connect(port, host);
  });
}

// Test Postgres connection
async function testPgConnection(config) {
  try {
    // Try basic connection using Prisma
    const prisma = new PrismaClient();
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT current_timestamp as time, current_database() as database`;
    await prisma.$disconnect();
    
    return {
      success: true,
      result: result[0]
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Check if host is reachable (depending on platform)
async function checkHostReachable(host) {
  const isWindows = process.platform === 'win32';
  const pingCommand = isWindows ? 
    `ping -n 3 -w 1000 ${host}` : 
    `ping -c 3 -W 1 ${host}`;
  
  console.log(`Executing: ${pingCommand}`);
  return await execCommand(pingCommand);
}

// Main diagnostic function
async function runDiagnostics() {
  console.log('=== DATABASE CONNECTION DIAGNOSTIC TOOL ===\n');
  
  // 1. Check DATABASE_URL environment variable
  console.log('Step 1: Checking DATABASE_URL...');
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in your environment');
    console.log('Please add it to your .env file');
    return;
  }
  
  console.log('✅ DATABASE_URL is set');
  
  // 2. Parse the URL
  console.log('\nStep 2: Parsing DATABASE_URL...');
  const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL);
  
  if (!dbConfig) {
    console.error('❌ Failed to parse DATABASE_URL');
    return;
  }
  
  console.log('✅ Successfully parsed DATABASE_URL:');
  console.log(`- Host: ${dbConfig.host}`);
  console.log(`- Port: ${dbConfig.port}`);
  console.log(`- Database: ${dbConfig.database}`);
  console.log(`- User: ${dbConfig.user}`);
  console.log(`- SSL: ${dbConfig.ssl ? 'Enabled' : 'Disabled'}`);
  
  // 3. Check DNS resolution
  console.log('\nStep 3: Testing DNS resolution...');
  console.log(`Resolving hostname: ${dbConfig.host}`);
  
  const dnsResult = await checkDnsResolution(dbConfig.host);
  if (dnsResult.success) {
    console.log(`✅ Successfully resolved ${dbConfig.host} to ${dnsResult.address} (${dnsResult.family})`);
  } else {
    console.error(`❌ Failed to resolve hostname: ${dnsResult.error}`);
    console.log('\nThis suggests one of the following issues:');
    console.log('- DNS server issues or misconfiguration');
    console.log('- The Supabase host no longer exists or has changed');
    console.log('- Network connectivity problems');
    console.log('\nCheck that your Supabase project is active and not deleted');
    return;
  }
  
  // 4. Try ping (may not work due to firewall rules)
  console.log('\nStep 4: Testing basic connectivity with ping...');
  console.log('Note: Many cloud providers block ping requests, so failure here is not definitive.');
  
  const pingResult = await checkHostReachable(dbConfig.host);
  if (pingResult.success) {
    console.log(`✅ Host ${dbConfig.host} responds to ping`);
    console.log(pingResult.output);
  } else {
    console.log(`⚠️ Host ${dbConfig.host} does not respond to ping`);
    console.log('This is common for cloud services and not necessarily a problem.');
  }
  
  // 5. Test TCP connection to the database port
  console.log(`\nStep 5: Testing TCP connection to ${dbConfig.host}:${dbConfig.port}...`);
  
  const tcpResult = await testTcpConnection(dbConfig.host, dbConfig.port);
  if (tcpResult.success) {
    console.log(`✅ Successfully established TCP connection to ${dbConfig.host}:${dbConfig.port}`);
  } else {
    console.error(`❌ Failed to connect to ${dbConfig.host}:${dbConfig.port}: ${tcpResult.error}`);
    console.log('\nThis indicates one of the following issues:');
    console.log('- A firewall is blocking outbound connections to this port');
    console.log('- The database server is down or not accepting connections');
    console.log('- Network connectivity problems between your machine and the database');
    console.log('\nPossible solutions:');
    console.log('1. Check if your network (school, company, etc.) blocks outbound database connections');
    console.log('2. Try connecting from a different network (e.g., mobile hotspot)');
    console.log('3. Verify Supabase status at https://status.supabase.com/');
    console.log('4. Check if your Supabase project is active and not paused');
    return;
  }
  
  // 6. Test full Postgres connection
  console.log('\nStep 6: Testing full Postgres connection...');
  
  const pgResult = await testPgConnection();
  if (pgResult.success) {
    console.log('✅ Successfully connected to the PostgreSQL database!');
    console.log(`Database time: ${pgResult.result.time}`);
    console.log(`Connected to database: ${pgResult.result.database}`);
  } else {
    console.error('❌ Failed to connect to PostgreSQL:', pgResult.error);
    console.log('\nAuthentication or connection error. Possible issues:');
    console.log('- Incorrect username or password in DATABASE_URL');
    console.log('- Database permissions issue');
    console.log('- SSL configuration issue');
    console.log('- The database might be at capacity or experiencing issues');
  }
  
  console.log('\n=== DIAGNOSTIC RESULTS ===');
  if (pgResult.success) {
    console.log('\n✅ All tests PASSED - your database connection is working correctly!');
  } else if (tcpResult.success) {
    console.log('\n⚠️ Mixed results: TCP connection works but PostgreSQL connection fails');
    console.log('This suggests authentication issues or database server problems.');
  } else if (dnsResult.success) {
    console.log('\n❌ Tests FAILED: Can resolve the hostname but cannot connect to the database port');
    console.log('This suggests network connectivity issues or firewall restrictions.');
  } else {
    console.log('\n❌ Tests FAILED: Cannot even resolve the database hostname');
    console.log('This suggests DNS or fundamental network connectivity issues.');
  }
  
  console.log('\nRecommended actions:');
  console.log('1. Check Supabase status: https://status.supabase.com/');
  console.log('2. If on a restricted network (school/work), try from a different network');
  console.log('3. Verify your DATABASE_URL is correct and up to date');
}

// Run the diagnostics
runDiagnostics().catch(error => {
  console.error('Diagnostics script error:', error);
});
