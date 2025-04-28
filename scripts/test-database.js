/**
 * Test script to check database connection and schema
 * 
 * Run with: node scripts/test-database.js
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Create a Prisma client
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn']
});

async function testDatabaseConnection() {
  console.log('Testing database connection...');
  
  try {
    await prisma.$connect();
    console.log('✅ Connected to database successfully!');
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as connection_test`;
    console.log('✅ Query executed successfully:', result);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (error.message.includes('5432') && error.message.includes("Can't reach database server")) {
      console.log('\n⚠️ Port 5432 appears to be blocked. Try these solutions:');
      console.log('1. Try connecting from a different network (e.g., mobile hotspot)');
      console.log('2. Edit your .env file to change port 5432 to 6543 in DATABASE_URL');
    }
    
    return false;
  }
}

async function checkDatabaseSchema() {
  console.log('\nChecking database schema...');
  
  try {
    // Get all tables in the database
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    console.log(`\nFound ${tables.length} tables in the database:`);
    tables.forEach(t => console.log(`- ${t.table_name}`));
    
    // Look for user tables specifically
    const userTables = tables.filter(t => 
      t.table_name.toLowerCase().includes('user')
    );
    
    if (userTables.length === 0) {
      console.error('\n❌ No user tables found in the database!');
      console.error('   This will cause authentication to fail.');
    } else {
      console.log(`\n✅ Found ${userTables.length} user-related tables:`);
      
      // Check each user table
      for (const table of userTables) {
        console.log(`\n📊 Examining table: ${table.table_name}`);
        
        // Get columns
        const columns = await prisma.$queryRaw`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = ${table.table_name}
          ORDER BY ordinal_position;
        `;
        
        console.log('Columns:');
        columns.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));
        
        // Count records
        const countQuery = `SELECT COUNT(*) as count FROM "${table.table_name}"`;
        const countResult = await prisma.$queryRawUnsafe(countQuery);
        const recordCount = parseInt(countResult[0].count);
        
        console.log(`Records count: ${recordCount}`);
        
        // Check if this table has essential fields
        const hasEmail = columns.some(c => c.column_name === 'email');
        const hasUserId = columns.some(c => c.column_name === 'user_id') || 
                         columns.some(c => c.column_name === 'id');
        const hasIsOwner = columns.some(c => c.column_name === 'isowner');
        
        if (hasEmail && hasUserId && hasIsOwner) {
          console.log('✅ Table has all essential fields for authentication');
          
          if (recordCount > 0) {
            // Show sample record
            const sampleQuery = `SELECT * FROM "${table.table_name}" LIMIT 1`;
            const sample = await prisma.$queryRawUnsafe(sampleQuery);
            console.log('Sample record (first row):', sample[0]);
          }
        } else {
          console.log('❌ Table is missing essential fields:');
          if (!hasEmail) console.log('  - Missing email field');
          if (!hasUserId) console.log('  - Missing user_id or id field');
          if (!hasIsOwner) console.log('  - Missing isowner field');
        }
      }
    }
    
    // Check Prisma client model mapping
    console.log('\nChecking Prisma client models...');
    const availableModels = Object.keys(prisma).filter(key => 
      !key.startsWith('$') && typeof prisma[key] === 'object'
    );
    
    console.log('Available Prisma models:', availableModels);
    
    // Check if user tables are mapped in Prisma
    const userTableNames = userTables.map(t => t.table_name);
    const unmappedTables = userTableNames.filter(name => !availableModels.includes(name));
    
    if (unmappedTables.length > 0) {
      console.error('\n❌ Some user tables are not mapped in Prisma:');
      unmappedTables.forEach(t => console.error(`  - ${t}`));
      console.error('\nThis will cause authentication to fail!');
      console.error('Make sure your Prisma schema matches your database schema.');
    } else {
      console.log('\n✅ All user tables are properly mapped in Prisma');
    }
    
  } catch (error) {
    console.error('❌ Error checking database schema:', error);
  }
}

async function main() {
  try {
    const connected = await testDatabaseConnection();
    
    if (connected) {
      await checkDatabaseSchema();
    }
  } catch (error) {
    console.error('Unhandled error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
