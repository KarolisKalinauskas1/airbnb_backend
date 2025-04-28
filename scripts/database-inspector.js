/**
 * Database Inspector Script
 * 
 * This script examines your database schema to help identify the correct user table
 * and determine how to access it via Prisma.
 * 
 * Run with: node scripts/database-inspector.js
 */
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

async function inspectDatabase() {
  console.log('Starting database inspection...');
  
  // Create Prisma client
  const prisma = new PrismaClient({
    log: ['query', 'error', 'warn']
  });
  
  try {
    console.log('\nChecking database connection...');
    try {
      await prisma.$connect();
      console.log('✅ Connected to database successfully.');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      console.error('Please check your DATABASE_URL in the .env file.');
      return;
    }
    
    console.log('\nExamining available models in Prisma client...');
    // Get all properties from prisma that might be models
    const potentialModels = Object.keys(prisma)
      .filter(key => !key.startsWith('$') && typeof prisma[key] === 'object');
    
    console.log('Found the following potential models:');
    console.log(potentialModels.join(', '));
    
    console.log('\nLooking for user-related tables:');
    const userTables = potentialModels.filter(name => 
      name.toLowerCase().includes('user')
    );
    
    if (userTables.length > 0) {
      console.log('Found user-related tables:', userTables.join(', '));
    } else {
      console.log('No user-related tables found.');
    }
    
    // Check each potential user table
    for (const tableName of userTables) {
      console.log(`\nInspecting "${tableName}" table:`);
      try {
        // Try count
        const count = await prisma[tableName].count();
        console.log(`- Contains ${count} records`);
        
        // Get a sample record
        if (count > 0) {
          const sample = await prisma[tableName].findFirst();
          console.log('- Fields available:');
          Object.keys(sample).forEach(field => {
            console.log(`  - ${field}: ${typeof sample[field]} (${sample[field]})`);
          });
          
          // Check for auth-related fields specifically
          const hasAuthFields = 'auth_user_id' in sample || 'authUserId' in sample;
          const hasOwnerFlag = 'isowner' in sample || 'isOwner' in sample;
          
          console.log(`- Has auth fields: ${hasAuthFields ? 'Yes' : 'No'}`);
          console.log(`- Has owner flag: ${hasOwnerFlag ? 'Yes' : 'No'}`);
          
          // Recommendation
          if ('user_id' in sample && 'email' in sample) {
            console.log('✅ This appears to be the main user table you should use.');
            console.log(`Recommended code: await prisma.${tableName}.findFirst({ where: { email: 'user@example.com' } })`);
          }
        }
      } catch (error) {
        console.error(`❌ Error inspecting ${tableName}:`, error.message);
      }
    }
    
    // Try to execute a raw query to get table names from the database
    console.log('\nExecuting raw query to get all tables from database...');
    try {
      const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `;
      
      console.log('All database tables:');
      tables.forEach(table => {
        console.log(`- ${table.table_name}`);
      });
      
      // Find user tables that might not be properly mapped in Prisma
      const unmappedUserTables = tables
        .map(t => t.table_name)
        .filter(name => name.toLowerCase().includes('user'))
        .filter(name => !userTables.includes(name));
      
      if (unmappedUserTables.length > 0) {
        console.log('\n⚠️ Found user tables in database that might not be properly mapped in Prisma:');
        unmappedUserTables.forEach(name => console.log(`- ${name}`));
      }
    } catch (error) {
      console.error('Failed to execute raw query:', error.message);
    }
    
    console.log('\nDatabase inspection complete.');
  } catch (error) {
    console.error('Inspection error:', error);
  } finally {
    // Disconnect Prisma client
    await prisma.$disconnect();
  }
}

inspectDatabase().catch(console.error);
