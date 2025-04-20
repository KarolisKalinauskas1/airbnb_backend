#!/usr/bin/env node
/**
 * Thomas More Network Fix Tool
 * This script helps diagnose and fix network connectivity issues specific to 
 * educational institutions like Thomas More which often block database ports
 */
require('dotenv').config();
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const dns = require('dns').promises;
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask questions
function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Parse Postgres URL
function parseDbUrl(url) {
  if (!url) return null;
  
  try {
    const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/;
    const match = url.match(regex);
    
    if (!match) return null;
    
    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4]),
      database: match[5],
      params: match[6] || ''
    };
  } catch (err) {
    return null;
  }
}

// Create a new connection string with different port
function createDbUrl(components, port) {
  if (!components) return null;
  return `postgres://${components.user}:${components.password}@${components.host}:${port}/${components.database}${components.params}`;
}

// Test port connectivity
function testPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    console.log(`Testing connection to ${host}:${port}...`);
    const socket = new net.Socket();
    let resolved = false;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

// Check if we are on Thomas More network
async function isOnThomasMoreNetwork() {
  try {
    // Check for Thomas More hostnames in DNS
    const lookupPromise = dns.lookup('thomasmore.be');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('DNS lookup timeout')), 2000)
    );
    
    await Promise.race([lookupPromise, timeoutPromise]);
    return true;
  } catch {
    return false;
  }
}

// Test Prisma connection
async function testPrismaConnection(url) {
  try {
    const prisma = new PrismaClient({
      datasources: { db: { url } }
    });
    
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    await prisma.$disconnect();
    
    return {
      success: true,
      result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Update .env file with working URL
function updateEnvFile(newUrl) {
  const envPath = path.join(__dirname, '..', '.env');
  
  try {
    if (!fs.existsSync(envPath)) {
      console.error('❌ .env file not found!');
      return false;
    }
    
    // Backup original .env
    const backupPath = path.join(__dirname, '..', '.env.bak');
    fs.copyFileSync(envPath, backupPath);
    console.log(`✅ Created backup of original .env at ${backupPath}`);
    
    let content = fs.readFileSync(envPath, 'utf8');
    
    // Update DATABASE_URL
    content = content.replace(/DATABASE_URL=.*(\r?\n|$)/g, `DATABASE_URL="${newUrl}"$1`);
    
    // Update DIRECT_URL if it exists
    if (content.includes('DIRECT_URL=')) {
      const directUrl = newUrl.replace('?pgbouncer=true', '').replace('?sslmode=require', '');
      content = content.replace(/DIRECT_URL=.*(\r?\n|$)/g, `DIRECT_URL="${directUrl}"$1`);
    }
    
    // Write updated content back to .env
    fs.writeFileSync(envPath, content);
    console.log('✅ Updated .env file with working connection URL');
    return true;
  } catch (error) {
    console.error('❌ Failed to update .env file:', error.message);
    return false;
  }
}

// Create temporary offline mode
function enableOfflineMode() {
  const envPath = path.join(__dirname, '..', '.env');
  
  try {
    let content = '';
    
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
    
    // Add or update OFFLINE_MODE flag
    if (content.includes('OFFLINE_MODE=')) {
      content = content.replace(/OFFLINE_MODE=.*(\r?\n|$)/g, `OFFLINE_MODE=true$1`);
    } else {
      content += '\n# Temporary offline mode flag\nOFFLINE_MODE=true\n';
    }
    
    fs.writeFileSync(envPath, content);
    console.log('✅ Enabled offline mode in .env file');
    return true;
  } catch (error) {
    console.error('❌ Failed to enable offline mode:', error.message);
    return false;
  }
}

// Try to fix connection issues by modifying .env file
async function main() {
  console.log('\n======== THOMAS MORE NETWORK CONNECTION FIX TOOL ========\n');
  
  // Check if .env file exists
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found! Please create one first.');
    process.exit(1);
  }
  
  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in your .env file');
    process.exit(1);
  }
  
  console.log('Current DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@'));
  
  // Check if we are on Thomas More network
  const onTMNetwork = await isOnThomasMoreNetwork();
  console.log(`\nDetected Thomas More network: ${onTMNetwork ? 'Yes ✓' : 'No ✗'}`);
  
  if (onTMNetwork) {
    console.log('\n⚠️ You are on Thomas More network which often blocks database connections.');
    console.log('This tool will help you try alternative connection methods.\n');
  }
  
  // Parse current URL
  const dbConfig = parseDbUrl(process.env.DATABASE_URL);
  if (!dbConfig) {
    console.error('❌ Failed to parse DATABASE_URL. The format may be incorrect.');
    process.exit(1);
  }
  
  console.log(`\nDatabase host: ${dbConfig.host}`);
  console.log(`Current port: ${dbConfig.port}\n`);
  
  // Test DNS resolution
  try {
    console.log(`Testing DNS resolution for ${dbConfig.host}...`);
    const { address } = await dns.lookup(dbConfig.host);
    console.log(`✅ DNS resolution successful: ${address}`);
  } catch (error) {
    console.error(`❌ DNS resolution failed: ${error.message}`);
    console.log('This indicates a network issue that may prevent database connections.\n');
    
    const offline = await ask('Would you like to enable offline mode? (y/n): ');
    if (offline.toLowerCase() === 'y') {
      enableOfflineMode();
      console.log('Please restart your application for changes to take effect.');
    }
    rl.close();
    return;
  }
  
  // Test port connectivity for different ports
  console.log('\nTesting different ports for Supabase connectivity...');
  const portsToTry = [5432, 6543, 5433, 5434, 5431, 443, 80];
  const openPorts = [];
  
  for (const port of portsToTry) {
    const isOpen = await testPort(dbConfig.host, port);
    if (isOpen) {
      console.log(`✅ Port ${port} is open`);
      openPorts.push(port);
    } else {
      console.log(`❌ Port ${port} is blocked or closed`);
    }
  }
  
  if (openPorts.length === 0) {
    console.log('\n❌ All tested ports are blocked on this network.');
    console.log('Options:');
    console.log('1. Try connecting from a different network (e.g., mobile hotspot)');
    console.log('2. Enable offline mode for development');
    
    const offline = await ask('Would you like to enable offline mode? (y/n): ');
    if (offline.toLowerCase() === 'y') {
      enableOfflineMode();
      console.log('Please restart your application for changes to take effect.');
    }
    rl.close();
    return;
  }
  
  // Try to connect with each open port
  console.log('\nTesting database connections on open ports...');
  const workingConfigurations = [];
  
  for (const port of openPorts) {
    const newUrl = createDbUrl(dbConfig, port);
    if (!newUrl) continue;
    
    console.log(`\nTesting connection with port ${port}...`);
    const result = await testPrismaConnection(newUrl);
    
    if (result.success) {
      console.log(`✅ Successfully connected using port ${port}!`);
      workingConfigurations.push({ port, url: newUrl });
    } else {
      console.log(`❌ Connection failed with port ${port}: ${result.error}`);
    }
  }
  
  if (workingConfigurations.length > 0) {
    console.log('\n✅ Found working configurations!');
    
    // Use the first working configuration
    const config = workingConfigurations[0];
    console.log(`Recommended configuration: port ${config.port}`);
    
    const update = await ask('Update your .env file with the working configuration? (y/n): ');
    if (update.toLowerCase() === 'y') {
      updateEnvFile(config.url);
      console.log('\nPlease restart your application for changes to take effect.');
    } else {
      console.log('\nTo manually update your .env file, use this connection string:');
      console.log(config.url.replace(/:[^:]*@/, ':***@'));
    }
  } else {
    console.log('\n❌ Could not establish a working database connection.');
    console.log('Options:');
    console.log('1. Try connecting from a different network');
    console.log('2. Enable offline mode for development');
    
    const offline = await ask('Would you like to enable offline mode? (y/n): ');
    if (offline.toLowerCase() === 'y') {
      enableOfflineMode();
      console.log('Please restart your application for changes to take effect.');
    }
  }
  
  rl.close();
}

// Run the main function
main().catch(error => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});
