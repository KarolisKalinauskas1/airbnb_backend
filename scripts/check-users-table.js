#!/usr/bin/env node
/**
 * Script to check the structure of the users table
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function checkUsersTable() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Checking users table structure...');
    
    // Query table structure
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position
    `;
    
    console.log('\nUsers table structure:');
    columns.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not null'}, default: ${col.column_default || 'none'})`);
    });
  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsersTable().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
