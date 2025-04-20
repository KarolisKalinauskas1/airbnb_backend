#!/usr/bin/env node
/**
 * Network Connectivity Diagnostic Tool
 * 
 * This script helps diagnose network issues with your Supabase connection
 */
require('dotenv').config();
const dns = require('dns').promises;
const { exec } = require('child_process');
const net = require('net');
const { URL } = require('url');

// Extract database host and port from DATABASE_URL
function extractDatabaseInfo() {
  try {
    if (!process.env.DATABASE_URL) return { host: null, port: null };
    
    // Replace postgres:// with http:// for URL parsing
    const url = new URL(process.env.DATABASE_URL.replace('postgres://', 'http://'));
    return { 
      host: url.hostname,
      port: url.port || 5432 
    };
  } catch (err) {
    console.error('Failed to parse DATABASE_URL:', err.message);
    return { host: null, port: null };
  }
}

// Run ping command
function ping(host) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const pingCmd = isWindows ? 
      `ping -n 3 ${host}` : 
      `ping -c 3 ${host}`;
    
    exec(pingCmd, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          output: stderr || 'Host unreachable'
        });
        return;
      }
      
      resolve({
        success: true,
        output: stdout
      });
    });
  });
}

// Check if a port is open
function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;
    
    // Set timeout
    socket.setTimeout(timeout);
    
    // Handle connection
    socket.on('connect', () => {
      socket.end();
      resolve({
        success: true,
        message: `Port ${port} is open on ${host}`
      });
    });
    
    // Handle errors
    socket.on('error', (err) => {
      resolve({
        success: false,
        message: `Cannot connect to ${host}:${port} - ${err.message}`
      });
    });
    
    // Handle timeout
    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        success: false,
        message: `Connection to ${host}:${port} timed out after ${timeout}ms`
      });
    });
    
    // Try to connect
    try {
      socket.connect(port, host);
    } catch (err) {
      resolve({
        success: false,
        message: `Failed to initiate connection to ${host}:${port} - ${err.message}`
      });
    }
  });
}

async function runDiagnostics() {
  console.log('===== NETWORK CONNECTIVITY DIAGNOSTIC TOOL =====');
  console.log('This tool will help diagnose network connectivity issues with Supabase.\n');
  
  // Get database info
  const { host: dbHost, port: dbPort } = extractDatabaseInfo();
  
  console.log('1. Checking DATABASE_URL...');
  if (!dbHost) {
    console.error('❌ DATABASE_URL is missing or invalid');
    console.log('Please check your .env file and ensure DATABASE_URL is set correctly.');
    return;
  }
  
  console.log(`✅ Found database host: ${dbHost}, port: ${dbPort}`);
  
  // Check DNS resolution
  console.log('\n2. Testing DNS resolution...');
  
  // Test common hosts first to verify DNS is working
  const testHosts = [
    'google.com',
    'github.com',
    'supabase.com',
    dbHost
  ];
  
  for (const host of testHosts) {
    try {
      const { address, family } = await dns.lookup(host);
      console.log(`✅ Successfully resolved ${host} to ${address} (IPv${family})`);
    } catch (err) {
      console.error(`❌ Failed to resolve ${host}: ${err.message}`);
      
      if (host === dbHost) {
        console.error('\nThis is a critical error as your database host cannot be resolved.');
        console.error('Possible causes:');
        console.error('1. Your Supabase project might be disabled or deleted');
        console.error('2. DNS servers are having issues');
        console.error('3. Network restrictions are blocking DNS resolution');
      }
    }
  }
  
  // Ping tests
  console.log('\n3. Testing network reachability with ping...');
  
  for (const host of testHosts) {
    console.log(`\nPinging ${host}...`);
    const pingResult = await ping(host);
    
    if (pingResult.success) {
      console.log('✅ Ping successful:');
      // Extract and display only the important parts of ping output
      const pingLines = pingResult.output.split('\n')
        .filter(line => line.includes('time=') || line.includes('statistics'));
      console.log(pingLines.join('\n'));
    } else {
      console.error(`❌ Ping failed: ${pingResult.output}`);
      
      if (host === dbHost) {
        console.error('Your database host is not responding to ping requests.');
        console.error('Note: Some cloud providers block ping requests for security reasons.');
        console.error('This is not necessarily an error if other connectivity tests succeed.');
      }
    }
  }
  
  // Connection tests
  console.log('\n4. Testing direct connection to database port...');
  
  // Test connection to the database port
  if (dbHost && dbPort) {
    const portResult = await checkPort(dbHost, dbPort);
    
    if (portResult.success) {
      console.log(`✅ ${portResult.message}`);
    } else {
      console.error(`❌ ${portResult.message}`);
      console.error('\nThis indicates that:');
      console.error('1. The database port might be blocked by a firewall');
      console.error('2. Your Supabase database might be paused or unavailable');
      console.error('3. Your network might restrict outbound connections to database ports');
    }
  }
  
  console.log('\n===== DIAGNOSTICS SUMMARY =====');
  console.log('If DNS resolution succeeded but the port test failed, this suggests:');
  console.log('1. Your network is likely blocking outbound database connections');
  console.log('2. You may need to use a different network or a VPN service');
  console.log('3. Contact your network administrator to allow connections to Supabase');
  console.log('\nIf DNS resolution failed for the database host:');
  console.log('1. Check your Supabase project status in the Supabase dashboard');
  console.log('2. Your PROJECT_URL might be incorrect or the project might be deleted');
  
  console.log('\nRecommended actions:');
  console.log('1. Try connecting from a different network (e.g., mobile hotspot)');
  console.log('2. Check Supabase status: https://status.supabase.com/');
  console.log('3. Verify your project is active in the Supabase dashboard');
}

runDiagnostics().catch(error => {
  console.error('Error running diagnostics:', error);
});
