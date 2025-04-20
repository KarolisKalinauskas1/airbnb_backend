#!/usr/bin/env node
/**
 * Direct Database Connection Test
 * Attempts to connect directly to the database with various settings
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Parse the DATABASE_URL into components
function parseDbUrl(url) {
  try {
    if (!url) return null;
    
    // Standard format: postgres://username:password@hostname:port/database
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

// Test connection with a specific configuration
async function testConnection(config, label) {
  console.log(`\nTesting connection ${label}...`);
  console.log(JSON.stringify({...config, password: '***'}, null, 2));
  
  const pool = new Pool(config);
  
  try {
    // Try to connect
    const client = await pool.connect();
    console.log(`✅ Connected successfully!`);
    
    // Run a test query
    const result = await client.query('SELECT 1 as test');
    console.log(`✅ Query executed successfully: ${JSON.stringify(result.rows[0])}`);
    
    client.release();
    await pool.end();
    
    return { success: true };
  } catch (error) {
    console.error(`❌ Connection failed: ${error.message}`);
    
    try {
      await pool.end();
    } catch {}
    
    return { success: false, error: error.message };
  }
}

// Attempt to create an alternative connection URL
function createAlternativeUrl(components, port) {
  return `postgres://${components.user}:${components.password}@${components.host}:${port}/${components.database}`;
}

// Update .env file if requested
function updateEnvFile(newUrl, configs) {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    return false;
  }
  
  // Create backup
  fs.copyFileSync(envPath, `${envPath}.backup`);
  console.log(`✅ Created backup of .env at ${envPath}.backup`);
  
  // Read and update content
  let content = fs.readFileSync(envPath, 'utf8');
  
  // Update DATABASE_URL
  if (content.includes('DATABASE_URL=')) {
    content = content.replace(/DATABASE_URL=.*(\r?\n|$)/g, `DATABASE_URL="${newUrl}"$1`);
  } else {
    content += `\nDATABASE_URL="${newUrl}"\n`;
  }
  
  // Update DIRECT_URL if it exists
  if (content.includes('DIRECT_URL=')) {
    const directUrl = newUrl.replace('?pgbouncer=true', '');
    content = content.replace(/DIRECT_URL=.*(\r?\n|$)/g, `DIRECT_URL="${directUrl}"$1`);
  }
  
  // Add the testing configs as comments for future reference
  content += '\n# --- Successful connection configs ---\n';
  configs.forEach((config, i) => {
    content += `# Config ${i+1}: ${JSON.stringify({...config, password: '***'})}\n`;
  });
  
  fs.writeFileSync(envPath, content);
  console.log(`✅ Updated .env file with new connection information`);
  return true;
}

// Main function
async function main() {
  console.log('========= DIRECT DATABASE CONNECTION TESTER =========');
  
  // Check if DATABASE_URL exists
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not defined in your environment');
    process.exit(1);
  }
  
  // Parse the current connection string
  const dbInfo = parseDbUrl(process.env.DATABASE_URL);
  if (!dbInfo) {
    console.error('❌ Failed to parse DATABASE_URL');
    process.exit(1);
  }
  
  console.log('Current database configuration:');
  console.log(`Host: ${dbInfo.host}`);
  console.log(`Port: ${dbInfo.port}`);
  console.log(`Database: ${dbInfo.database}`);
  console.log(`User: ${dbInfo.user}`);
  
  // Create different test configurations
  const portsToTry = [5432, 5433, 6543, 5434, 443];
  const sslOptions = [
    { rejectUnauthorized: false },
    true,
    { rejectUnauthorized: true },
    false
  ];
  
  // Store successful configurations
  const successfulConfigs = [];
  
  // Test basic connection first
  const basicConfig = {
    user: dbInfo.user,
    password: dbInfo.password,
    host: dbInfo.host,
    port: dbInfo.port,
    database: dbInfo.database,
    ssl: { rejectUnauthorized: false }
  };
  
  const basicResult = await testConnection(basicConfig, "with current settings");
  if (basicResult.success) {
    successfulConfigs.push(basicConfig);
  }
  
  // If the basic connection failed, try alternative configurations
  if (!basicResult.success) {
    console.log('\nTrying alternative configurations...');
    
    // Try different ports
    for (const port of portsToTry) {
      if (port === dbInfo.port) continue; // Skip the current port
      
      // Try different SSL options for this port
      for (const ssl of sslOptions) {
        const config = {
          user: dbInfo.user,
          password: dbInfo.password,
          host: dbInfo.host,
          port: port,
          database: dbInfo.database,
          ssl: ssl
        };
        
        const result = await testConnection(config, `port=${port}, ssl=${JSON.stringify(ssl)}`);
        if (result.success) {
          successfulConfigs.push(config);
          // Break out of the SSL loop after finding a working config for this port
          break;
        }
      }
    }
  }
  
  // Report results
  if (successfulConfigs.length > 0) {
    console.log(`\n✅ Found ${successfulConfigs.length} working connection configuration(s)!`);
    
    // Create a new connection URL with the first successful config
    const bestConfig = successfulConfigs[0];
    const newUrl = createAlternativeUrl(dbInfo, bestConfig.port);
    
    console.log('\nWould you like to update your .env file with this working configuration?');
    console.log('Enter y/yes to update, any other input to skip: ');
    
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (input) => {
      const answer = input.toString().trim().toLowerCase();
      if (answer === 'y' || answer === 'yes') {
        updateEnvFile(newUrl, successfulConfigs);
        console.log('\n✅ Configuration updated. Please restart your application.');
      } else {
        console.log('\nTo manually update your DATABASE_URL, use:');
        console.log(`DATABASE_URL="${newUrl.replace(/:[^:]*@/, ':***@')}"`);
      }
      process.exit(0);
    });
  } else {
    console.log('\n❌ No working connection configuration found.');
    console.log('This likely indicates a network issue preventing connections to Supabase.');
    console.log('\nPossible solutions:');
    console.log('1. Try connecting from a different network (e.g., mobile hotspot)');
    console.log('2. Check if your school/company network blocks database connections');
    console.log('3. Contact your network administrator to allow connections to Supabase');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error running connection tests:', error);
  process.exit(1);
});
