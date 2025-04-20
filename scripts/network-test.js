#!/usr/bin/env node
/**
 * Network Connectivity Tester
 * This script tests network connectivity to your database server
 * and helps diagnose connection issues
 */
require('dotenv').config();
const net = require('net');
const dns = require('dns').promises;
const https = require('https');
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Extract host and port from DATABASE_URL
function extractConnectionInfo() {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    
    const matches = url.match(/postgres:\/\/.*?@([^:]+):(\d+)/);
    if (!matches) return null;
    
    return {
      host: matches[1],
      port: parseInt(matches[2]),
      full_url: url
    };
  } catch (err) {
    console.error('Failed to parse DATABASE_URL:', err);
    return null;
  }
}

// Test DNS resolution
async function testDnsResolution(host) {
  console.log(`\n📡 Testing DNS resolution for ${host}...`);
  
  try {
    const result = await dns.lookup(host);
    console.log(`✅ DNS resolution successful! ${host} -> ${result.address}`);
    return { success: true, address: result.address };
  } catch (error) {
    console.error(`❌ DNS resolution failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Test direct TCP connection
function testTcpConnection(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    console.log(`\n🔌 Testing direct TCP connection to ${host}:${port}...`);
    
    const socket = new net.Socket();
    let isDone = false;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      if (isDone) return;
      isDone = true;
      console.log(`✅ Successfully connected to ${host}:${port}`);
      socket.destroy();
      resolve({ success: true });
    });
    
    socket.on('timeout', () => {
      if (isDone) return;
      isDone = true;
      console.log(`❌ Connection timed out after ${timeout}ms`);
      socket.destroy();
      resolve({ success: false, reason: 'timeout' });
    });
    
    socket.on('error', (err) => {
      if (isDone) return;
      isDone = true;
      console.log(`❌ Connection error: ${err.message}`);
      socket.destroy();
      resolve({ success: false, reason: err.code || err.message });
    });
    
    socket.connect(port, host);
  });
}

// Test connection from public website
function testFromPublicSite(host, port) {
  return new Promise((resolve) => {
    console.log(`\n🌐 Testing connection check via public service...`);
    
    const options = {
      hostname: 'networkappers.nl',
      path: `/api/v1/port-check?host=${encodeURIComponent(host)}&port=${port}`,
      method: 'GET'
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            console.log(`✅ External check shows port ${port} is OPEN`);
            resolve({ success: true });
          } else {
            console.log(`❌ External check shows port ${port} is CLOSED or filtered`);
            resolve({ success: false, reason: result.message || 'Port appears closed' });
          }
        } catch (e) {
          console.log('❌ Failed to parse external check response');
          resolve({ success: false, reason: 'Invalid response from port checker' });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ External check failed: ${error.message}`);
      resolve({ success: false, reason: error.message });
    });
    
    req.end();
  });
}

// Test Ping to host
async function testPing(host) {
  console.log(`\n🏓 Testing ping to ${host}...`);
  
  try {
    // Use ping command based on platform
    const cmd = process.platform === 'win32' 
      ? `ping -n 4 ${host}` 
      : `ping -c 4 ${host}`;
    
    const output = execSync(cmd, { encoding: 'utf8' });
    
    if (output.includes('Request timed out') || 
        output.includes('100% packet loss') || 
        output.includes('could not find host')) {
      console.log(`❌ Ping failed: No response from ${host}`);
      return { success: false, output };
    } else {
      // Extract response time if available
      const match = output.match(/time=(\d+)ms/);
      const time = match ? match[1] + 'ms' : 'unknown';
      console.log(`✅ Ping successful! Response time: ${time}`);
      return { success: true, time, output };
    }
  } catch (error) {
    console.log(`❌ Ping failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Test database connection using prisma
async function testPrismaConnection(url, timeout = 5000) {
  console.log('\n🔍 Testing database connection with Prisma...');
  console.log(`Using connection string: ${url.replace(/:[^:]*@/, ':***@')}`);
  
  return new Promise(async (resolve) => {
    try {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        console.log(`❌ Database connection timed out after ${timeout}ms`);
        resolve({ success: false, reason: 'Connection timed out' });
      }, timeout);
      
      // Create prisma client
      const prisma = new PrismaClient({
        datasources: {
          db: { url }
        }
      });
      
      try {
        await prisma.$connect();
        console.log('✅ Prisma connected successfully!');
        
        // Try a simple query
        const result = await prisma.$queryRaw`SELECT 1 as test`;
        console.log('✅ Database query executed successfully!');
        
        clearTimeout(timeoutId);
        await prisma.$disconnect();
        resolve({ success: true });
      } catch (error) {
        clearTimeout(timeoutId);
        console.log(`❌ Prisma connection failed: ${error.message}`);
        
        try {
          await prisma.$disconnect();
        } catch {}
        
        resolve({ success: false, error: error.message });
      }
    } catch (error) {
      console.log(`❌ Prisma client creation failed: ${error.message}`);
      resolve({ success: false, error: error.message });
    }
  });
}

// Try different ports for database URL
async function testAlternativePorts(dbInfo) {
  // Common Postgres ports to try
  const portsToTry = [5432, 5433, 6543, 5434, 5431, 443, 80];
  const results = [];
  
  console.log(`\n🔄 Testing alternative ports for ${dbInfo.host}...`);
  
  for (const port of portsToTry) {
    // Skip the current port as we already tested it
    if (port === dbInfo.port) continue;
    
    const result = await testTcpConnection(dbInfo.host, port);
    results.push({ port, ...result });
    
    if (result.success) {
      console.log(`\n🎯 Found open port: ${port}`);
      
      // Create a new connection URL with this port
      const newUrl = dbInfo.full_url.replace(`:${dbInfo.port}/`, `:${port}/`);
      
      // Test database connection with this new URL
      console.log(`Testing database connection on port ${port}...`);
      const dbResult = await testPrismaConnection(newUrl);
      
      if (dbResult.success) {
        console.log(`\n✅ SUCCESS! Port ${port} works for database connection!`);
        return { success: true, port, url: newUrl };
      }
    }
  }
  
  // No successful connections found
  console.log('\n❌ None of the alternative ports worked for database connection');
  return { success: false };
}

// Check for common network restrictions
function checkNetworkRestrictions() {
  console.log('\n🔒 Checking for common network restrictions...');
  
  // Check if we're on a corporate or educational network
  const possibleRestrictions = [];
  
  // Check if common ports are blocked
  const commonBlockedPorts = [
    'Database ports (5432, 6543)',
    'FTP ports (20, 21)',
    'Non-standard HTTP ports (8080, 8443)'
  ];
  
  possibleRestrictions.push('You may be on a restricted network (corporate, school, etc.)');
  possibleRestrictions.push('The network might be blocking outgoing connections to database ports');
  possibleRestrictions.push('A firewall might be intercepting the connection attempts');
  
  console.log('\nPossible network restrictions:');
  possibleRestrictions.forEach(r => console.log(` - ${r}`));
  
  console.log('\nCommonly blocked ports that might affect your connection:');
  commonBlockedPorts.forEach(p => console.log(` - ${p}`));
}

// Generate a report with all findings and recommendations
function generateReport(results) {
  const reportPath = path.join(__dirname, '../network-test-report.md');
  
  let report = `# Database Connection Test Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  
  report += `## Connection Information\n\n`;
  report += `- Host: ${results.host}\n`;
  report += `- Port: ${results.port}\n`;
  report += `- DNS Resolution: ${results.dns.success ? 'Successful' : 'Failed'}\n`;
  if (results.dns.address) {
    report += `  - IP Address: ${results.dns.address}\n`;
  }
  
  report += `\n## Connection Tests\n\n`;
  report += `- Direct TCP Connection: ${results.tcp.success ? 'Successful' : 'Failed'}\n`;
  if (!results.tcp.success && results.tcp.reason) {
    report += `  - Reason: ${results.tcp.reason}\n`;
  }
  
  report += `- Ping Test: ${results.ping.success ? 'Successful' : 'Failed'}\n`;
  if (results.ping.success && results.ping.time) {
    report += `  - Response Time: ${results.ping.time}\n`;
  }
  
  report += `- Database Connection: ${results.database.success ? 'Successful' : 'Failed'}\n`;
  if (!results.database.success && results.database.error) {
    report += `  - Error: ${results.database.error}\n`;
  }
  
  if (results.alternativePort && results.alternativePort.success) {
    report += `\n## Working Alternative Found!\n\n`;
    report += `✅ Connection successful on port ${results.alternativePort.port}\n`;
    report += `\nRecommended DATABASE_URL:\n\`\`\`\n${results.alternativePort.url.replace(/:[^:]*@/, ':***@')}\n\`\`\`\n`;
  } else {
    report += `\n## Recommendations\n\n`;
    report += `1. Try connecting from a different network (mobile hotspot, home network)\n`;
    report += `2. Contact your network administrator to allow outbound connections to PostgreSQL ports\n`;
    report += `3. Try using a VPN service to bypass network restrictions\n`;
    report += `4. Contact Supabase support for alternative connection methods\n`;
  }
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n📝 Report generated at: ${reportPath}`);
  
  return reportPath;
}

// Ask user if they want to update .env file
function askUpdateEnv(newUrl) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\nUpdate your .env file with this new URL? (y/n): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Update .env file with new URL
function updateEnvFile(newUrl) {
  try {
    const envPath = path.join(__dirname, '../.env');
    
    if (!fs.existsSync(envPath)) {
      console.error('❌ .env file not found!');
      return false;
    }
    
    // Create backup first
    fs.copyFileSync(envPath, path.join(__dirname, '../.env.backup'));
    console.log('✅ Created backup of .env file at .env.backup');
    
    // Read and update content
    let content = fs.readFileSync(envPath, 'utf8');
    content = content.replace(/DATABASE_URL=.*(\r?\n|$)/g, `DATABASE_URL="${newUrl}"$1`);
    
    // Also update DIRECT_URL if it exists
    if (content.includes('DIRECT_URL=')) {
      const directUrl = newUrl.replace('?pgbouncer=true', '');
      content = content.replace(/DIRECT_URL=.*(\r?\n|$)/g, `DIRECT_URL="${directUrl}"$1`);
    }
    
    fs.writeFileSync(envPath, content);
    console.log('✅ Updated .env file with new DATABASE_URL');
    return true;
  } catch (error) {
    console.error('❌ Failed to update .env file:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('========== DATABASE NETWORK CONNECTIVITY TESTER ==========\n');
  
  // 1. Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in your .env file');
    process.exit(1);
  }
  
  // 2. Extract connection info
  const dbInfo = extractConnectionInfo();
  if (!dbInfo) {
    console.error('❌ Failed to parse DATABASE_URL. Make sure it follows the format:');
    console.error('  postgres://username:password@hostname:port/database');
    process.exit(1);
  }
  
  console.log('Connection Information:');
  console.log(`- Host: ${dbInfo.host}`);
  console.log(`- Port: ${dbInfo.port}`);
  
  // Store all test results
  const results = {
    host: dbInfo.host,
    port: dbInfo.port
  };
  
  // 3. Test DNS resolution
  results.dns = await testDnsResolution(dbInfo.host);
  
  // 4. Test TCP connection
  results.tcp = await testTcpConnection(dbInfo.host, dbInfo.port);
  
  // 5. Test ping
  results.ping = await testPing(dbInfo.host);
  
  // 6. Test database connection
  results.database = await testPrismaConnection(dbInfo.full_url);
  
  // 7. If primary connection failed, test alternative ports
  if (!results.database.success) {
    console.log('\n⚠️ Primary connection failed. Testing alternative ports...');
    results.alternativePort = await testAlternativePorts(dbInfo);
    
    if (results.alternativePort.success) {
      const updateEnv = await askUpdateEnv(results.alternativePort.url);
      if (updateEnv) {
        updateEnvFile(results.alternativePort.url);
        console.log('\n✅ Connection problem solved! Restart your application to apply changes.');
      } else {
        console.log('\nTo manually update your DATABASE_URL:');
        console.log(`DATABASE_URL="${results.alternativePort.url.replace(/:[^:]*@/, ':***@')}"`);
      }
    } else {
      // If all connection attempts failed, check for network restrictions
      checkNetworkRestrictions();
    }
  }
  
  // 8. Generate a comprehensive report
  const reportPath = generateReport(results);
  console.log('\nDiagnostic process complete.');
  
  if (!results.database.success && (!results.alternativePort || !results.alternativePort.success)) {
    console.log('\n❌ No working connection method found.');
    console.log('Please try connecting from a different network (e.g., mobile hotspot)');
    console.log('The most likely issue is network restrictions blocking database ports.');
  }
}

main().catch(error => {
  console.error('Error running diagnostics:', error);
  process.exit(1);
});
