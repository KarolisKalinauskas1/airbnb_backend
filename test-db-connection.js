/**
 * Database Connection Test Script
 * Run this script to test your Supabase database connection
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

console.log('\n=== DATABASE CONNECTION TEST ===\n');

// Display connection information (masking sensitive values)
if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  const maskedUrl = url.substring(0, 15) + '...' + url.substring(url.length - 10);
  console.log(`Using connection URL: ${maskedUrl}`);
} else {
  console.log('DATABASE_URL not found in environment variables');
}

// Display other relevant environment variables (without values)
console.log('\nChecking relevant environment variables:');
[
  'SUPABASE_URL', 
  'SUPABASE_KEY', 
  'SUPABASE_SERVICE_KEY', 
  'SUPABASE_ANON_KEY'
].forEach(key => {
  console.log(`${key}: ${process.env[key] ? 'Set' : 'Not set'}`);
});

// Create a Prisma client
console.log('\nInitializing Prisma client...');
const prisma = new PrismaClient();

// Test the database connection
async function testConnection() {
  try {
    console.log('Attempting database query...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful!');
    console.log('Query result:', result);
    
    // Try to get table counts
    console.log('\nAttempting to count records in main tables...');
    const userCount = await prisma.public_users.count();
    console.log(`- Users: ${userCount}`);
    
    const spotCount = await prisma.camping_spot.count();
    console.log(`- Camping Spots: ${spotCount}`);
    
    const bookingsCount = await prisma.bookings.count();
    console.log(`- Bookings: ${bookingsCount}`);
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed!');
    console.error('Error details:', error.message);
    
    if (error.message.includes('timeout')) {
      console.log('\nPossible causes:');
      console.log('- Network connectivity issues');
      console.log('- Database server is down or unresponsive');
      console.log('- Firewall blocking the connection');
    }
    
    if (error.message.includes('authentication')) {
      console.log('\nPossible causes:');
      console.log('- Invalid database credentials');
      console.log('- Database user does not have proper permissions');
    }
    
    console.log('\nTroubleshooting steps:');
    console.log('1. Check that your DATABASE_URL in .env is correct');
    console.log('2. Verify Supabase service status at https://status.supabase.com/');
    console.log('3. Ensure your IP is allowed in Supabase dashboard settings');
    console.log('4. Check your Supabase project dashboard for database status');
    
    return false;
  } finally {
    await prisma.$disconnect();
    console.log('\nConnection test complete.');
  }
}

// Run the test
testConnection()
  .catch(err => {
    console.error('Uncaught error during testing:', err);
  });
