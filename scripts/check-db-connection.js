#!/usr/bin/env node
/**
 * Database Connection Check Script
 * 
 * This script checks if your database connection is properly configured and working.
 * Run this script with: node scripts/check-db-connection.js
 */
require('dotenv').config();
const { execSync } = require('child_process');

console.log('===== DATABASE CONNECTION DIAGNOSTIC TOOL =====');
console.log('This tool will help diagnose database connection issues with Supabase.');
console.log('\n1. Checking environment variables...');

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is not set in your .env file');
  console.log('Please make sure you have a valid DATABASE_URL in your .env file.');
  console.log('Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE');
  process.exit(1);
}

// Parse database URL to check components
try {
  const dbUrlPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const matches = process.env.DATABASE_URL.match(dbUrlPattern);
  
  if (!matches) {
    console.error('❌ ERROR: DATABASE_URL format appears invalid');
    console.log('Valid format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE');
    process.exit(1);
  }
  
  const [_, user, pass, host, port, database] = matches;
  
  console.log('\nDATABASE_URL components:');
  console.log(`- User: ${user}`);
  console.log(`- Password: ${'*'.repeat(pass.length)}`);
  console.log(`- Host: ${host}`);
  console.log(`- Port: ${port}`);
  console.log(`- Database: ${database}`);
  
  // Check if this is a Supabase URL
  if (host.includes('supabase.co') || host.includes('pooler.supabase')) {
    console.log('\n2. Detected Supabase database URL');
    
    // Check if network connection to Supabase is working
    console.log('\nTesting network connection to Supabase host...');
    try {
      // Using ping to check basic connectivity (works on both Windows and Unix)
      execSync(`ping -c 1 ${host}`, { timeout: 5000, stdio: 'ignore' });
      console.log(`✅ Host ${host} is reachable`);
    } catch (error) {
      console.error(`❌ ERROR: Could not reach host ${host}`);
      console.log('\nPossible solutions:');
      console.log('1. Check your internet connection');
      console.log('2. Verify Supabase is not down: https://status.supabase.com/');
      console.log('3. Your network might be blocking outbound connections to Supabase');
      console.log('\nRecommendation: Try running your app on a different network or check Supabase status.');
      process.exit(1);
    }
    
    // Check Supabase connection using a minimal PG client
    console.log('\n3. Testing direct database connection...');
    const { Client } = require('pg');
    
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000 // 5 seconds timeout
    });
    
    client.connect()
      .then(async () => {
        console.log('✅ Successfully connected to database!');
        
        try {
          const result = await client.query('SELECT current_timestamp');
          console.log(`Database time: ${result.rows[0].current_timestamp}`);
          
          console.log('\n✅ Database connection test PASSED');
          console.log('\nYour database connection should be working correctly.');
          console.log('If you still have issues, check your Supabase project settings');
          console.log('and make sure your project is active and not paused.');
        } catch (queryErr) {
          console.error('❌ Connection established but query failed:', queryErr.message);
        }
        
        await client.end();
      })
      .catch(err => {
        console.error('❌ Failed to connect to database:', err.message);
        
        if (err.message.includes('timeout')) {
          console.log('\nTimeout error connecting to database. Possible causes:');
          console.log('1. Supabase server might be down or unreachable from your network');
          console.log('2. Your database URL might be incorrect');
          console.log('3. Your Supabase project might be paused or in a sleep state');
        }
        
        if (err.message.includes('password authentication failed')) {
          console.log('\nAuthentication failed. Possible causes:');
          console.log('1. The password in your DATABASE_URL is incorrect');
          console.log('2. The user in your DATABASE_URL does not have access to the database');
        }
        
        console.log('\nRecommendation:');
        console.log('- Verify your Supabase project is active in the Supabase dashboard');
        console.log('- Check that your DATABASE_URL is correct in your .env file');
        console.log('- Try regenerating your database URL from the Supabase dashboard');
      });
  } else {
    console.log('\nThis does not appear to be a Supabase hosted database.');
    console.log('Make sure your database server is running and accessible.');
  }
} catch (error) {
  console.error('Error analyzing database URL:', error.message);
  process.exit(1);
}
