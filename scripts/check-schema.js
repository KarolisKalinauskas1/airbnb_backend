#!/usr/bin/env node
/**
 * Check Database Schema
 * 
 * This script checks the database schema to confirm the auth_user_id column exists
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function checkSchema() {
  console.log('Checking database schema...');
  
  const prisma = new PrismaClient({
    log: ['error']
  });
  
  try {
    await prisma.$connect();
    console.log('Connected to database');
    
    console.log('\nInspecting users table structure:');
    const users = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
      ORDER BY ordinal_position;
    `;
    
    console.log('\nColumns in users table:');
    users.forEach((col, i) => {
      console.log(`${i+1}. ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    
    // Check if auth_user_id exists
    const authUserIdCol = users.find(col => col.column_name === 'auth_user_id');
    
    if (authUserIdCol) {
      console.log('\n✅ auth_user_id column exists!');
      console.log(`Type: ${authUserIdCol.data_type}, Nullable: ${authUserIdCol.is_nullable}`);
    } else {
      console.log('\n❌ auth_user_id column is missing!');
      console.log('This means our fix needs to include a database migration to add this column.');
    }
    
    // Show sample user data to verify
    console.log('\nFetching sample user data to check auth_user_id values:');
    const sampleUsers = await prisma.users.findMany({
      select: {
        user_id: true,
        email: true,
        auth_user_id: true
      },
      take: 5
    });
    
    console.log('\nSample users:');
    sampleUsers.forEach(user => {
      console.log(`- User ID: ${user.user_id}, Email: ${user.email}, Auth User ID: ${user.auth_user_id || 'NULL'}`);
    });
    
    console.log('\nCheck complete!');
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema()
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
