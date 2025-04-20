#!/usr/bin/env node
/**
 * Supabase Port Scanner
 * Tests different ports to determine which ones are accessible
 */
require('dotenv').config();
const net = require('net');
const dns = require('dns').promises;

// Extract hostname from DATABASE_URL
function extractHostFromUrl(url) {
  try {
    if (!url || typeof url !== 'string') return null;
    const matches = url.match(/postgres:\/\/.*?@([^:]+):\d+\//);
    return matches ? matches[1] : null;
  } catch (error) {
    return null;
  }
}

// Test if a port is open on a host
function isPortOpen(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connectionRefused = false;
    let resolved = false;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({
        host,
        port,
        status: 'open',
        success: true
      });
    });
    
    socket.on('error', (err) => {
      if (resolved) return;
      connectionRefused = err.code === 'ECONNREFUSED';
      socket.destroy();
    });
    
    socket.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({
        host,
        port,
        status: 'blocked',
        success: false,
        message: 'Connection timed out'
      });
    });
    
    socket.on('close', () => {
      if (resolved) return;
      resolved = true;
      resolve({
        host,
        port,
        status: connectionRefused ? 'refused' : 'closed',
        success: false,
        message: connectionRefused ? 'Connection refused' : 'Connection closed'
      });
    });
    
    // Try to connect
    socket.connect(port, host);
  });
}

// Main function
async function scanPorts() {
  console.log('======= SUPABASE PORT SCANNER =======\n');
  
  // Ports to test - standard Postgres ports and Supabase pooler ports
  const portsToTest = [
    5432,  // Standard Postgres port
    6543,  // Supabase connection pooler port (default in the provided URL)
    5433,  // Alternative Postgres port sometimes used by Supabase
    5431,  // Alternative port
    443,   // HTTPS port - check if only web traffic is allowed
    80     // HTTP port - check if only web traffic is allowed
  ];
  
  // Test using the provided DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not found.');
    console.log('Please make sure your .env file contains the DATABASE_URL variable.');
    return;
  }
  
  // Extract the host from the DATABASE_URL
  const host = extractHostFromUrl(databaseUrl);
  if (!host) {
    console.error('❌ Could not extract host from DATABASE_URL.');
    console.log('Please check if your DATABASE_URL is correctly formatted.');
    return;
  }
  
  console.log(`Testing connectivity to host: ${host}`);
  
  // Test DNS resolution first
  try {
    console.log('\nChecking DNS resolution...');
    const { address } = await dns.lookup(host);
    console.log(`✅ DNS resolution successful: ${host} resolves to ${address}`);
  } catch (dnsError) {
    console.error(`❌ DNS resolution failed for ${host}: ${dnsError.message}`);
    console.error('This indicates a fundamental connectivity issue.');
    return;
  }
  
  console.log('\nTesting ports...');
  
  // Test each port
  const results = await Promise.all(
    portsToTest.map(port => isPortOpen(host, port))
  );
  
  // Display results in a table
  console.log('\nPort Scan Results:');
  console.log('--------------------------------------------------');
  console.log('| Port | Status  | Message                        |');
  console.log('--------------------------------------------------');
  
  results.forEach(result => {
    const status = result.status.padEnd(7);
    const message = result.message || 'Connection successful       ';
    console.log(`| ${result.port.toString().padEnd(4)} | ${status} | ${message.substring(0, 30).padEnd(30)} |`);
  });
  
  console.log('--------------------------------------------------');
  
  // Count open ports
  const openPorts = results.filter(r => r.success).map(r => r.port);
  
  if (openPorts.length > 0) {
    console.log(`\n✅ Successfully connected to ${openPorts.length} port(s): ${openPorts.join(', ')}`);
    
    // Find the port from the original DATABASE_URL
    const urlPort = databaseUrl.match(/:(\d+)\//);
    const originalPort = urlPort ? parseInt(urlPort[1]) : 6543;
    
    if (!openPorts.includes(originalPort)) {
      console.log('\n⚠️ The port in your DATABASE_URL is not accessible, but other ports are.');
      console.log('Try modifying your DATABASE_URL to use one of the open ports.');
      
      // Suggest a modified DATABASE_URL
      if (openPorts.length > 0) {
        const newUrl = databaseUrl.replace(`:${originalPort}/`, `:${openPorts[0]}/`);
        console.log(`\nSuggested DATABASE_URL:`);
        console.log(newUrl);
      }
    }
  } else {
    console.log('\n❌ Could not connect to any of the tested ports.');
    console.log('This suggests your network is blocking outbound connections to this host.');
    console.log('\nPossible solutions:');
    console.log('1. Try connecting from a different network (e.g., mobile hotspot)');
    console.log('2. Contact your network administrator to allow these connections');
    console.log('3. Use a VPN service to bypass network restrictions');
    console.log('4. Switch to offline development mode with mock data');
  }
}

// Run the port scanner
scanPorts().catch(error => {
  console.error('Error during port scanning:', error);
});
