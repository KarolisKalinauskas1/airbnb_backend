#!/usr/bin/env node
/**
 * SQL Connection Test Script
 * Tests direct SQL connection to the database, bypassing Prisma
 */
require('dotenv').config();
const { Client } = require('pg');

// Parse the DATABASE_URL to get individual components
function parseDatabaseUrl(url) {
  try {
    // Extract user:password@host:port/database from postgres://...
    const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
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

async function testConnection() {
  console.log('\n=== SQL CONNECTION TEST ===\n');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in your environment variables');
    console.log('Please add it to your .env file');
    return;
  }
  
  // Parse the URL for direct connection
  const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL);
  
  if (!dbConfig) {
    console.error('❌ Could not parse DATABASE_URL');
    console.log('Make sure it follows the format: postgres://user:password@host:port/database');
    return;
  }
  
  console.log(`Testing connection to: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`Database: ${dbConfig.database}`);
  console.log(`User: ${dbConfig.user}`);
  console.log(`SSL: ${dbConfig.ssl ? 'Enabled' : 'Disabled'}`);
  
  // Create postgres client
  const client = new Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000 // 5 second timeout
  });
  
  try {
    console.log('\nAttempting to connect...');
    await client.connect();
    
    console.log('✅ Connected successfully!');
    
    // Run a simple query
    console.log('\nRunning test query...');
    const result = await client.query('SELECT current_timestamp as time, current_database() as db');
    
    console.log('✅ Query successful!');
    console.log('Server time:', result.rows[0].time);
    console.log('Database name:', result.rows[0].db);
    
    // Test prisma_migrations table if it exists
    try {
      console.log('\nChecking for Prisma migrations table...');
      const migrationResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'prisma_migrations'
        );
      `);
      
      if (migrationResult.rows[0].exists) {
        console.log('✅ Prisma migrations table found');
        
        // Get migration count
        const countResult = await client.query('SELECT COUNT(*) FROM prisma_migrations');
        console.log(`Found ${countResult.rows[0].count} migrations applied`);
      } else {
        console.log('⚠️ Prisma migrations table not found');
        console.log('Database schema might not be initialized correctly');
      }
    } catch (error) {
      console.error('⚠️ Could not check migrations table:', error.message);
    }
    
    console.log('\n✅ DATABASE CONNECTION TEST PASSED');
    console.log('Your database connection is working correctly');
  } catch (error) {
    console.error('\n❌ CONNECTION ERROR:', error.message);
    
    // Provide more helpful guidance based on error message
    if (error.message.includes('timeout')) {
      console.log('\nPossible reasons for timeout:');
      console.log('1. The database server is down or unreachable');
      console.log('2. Network connectivity issues or firewall blocking the connection');
      console.log('3. Database is under heavy load or unresponsive');
    } else if (error.message.includes('password authentication failed')) {
      console.log('\nAuthentication error:');
      console.log('1. The username or password in your DATABASE_URL is incorrect');
      console.log('2. The user might not have permissions to access the database');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.log('\nHost resolution error:');
      console.log('1. The hostname in your DATABASE_URL is incorrect');
      console.log('2. DNS resolution is failing for the hostname');
      console.log('3. Check if the Supabase database exists and is active');
    }
    
    console.log('\nSuggested actions:');
    console.log('1. Verify your DATABASE_URL is correct');
    console.log('2. Check Supabase status: https://status.supabase.com/');
    console.log('3. Try connecting from a different network');
    console.log('4. Check if your Supabase project is active and not paused');
  } finally {
    // Close the connection
    try {
      await client.end();
    } catch (error) {
      // Ignore errors during disconnect
    }
  }
}

// Run the test
testConnection().catch(console.error);
