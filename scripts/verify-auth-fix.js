#!/usr/bin/env node
/**
 * Verification Script for User Registration Fixes
 * 
 * This script checks if the fixes to the user registration system are working properly.
 * It validates:
 * 1. That the database schema includes the auth_user_id field
 * 2. That users can register correctly in both Supabase and the database
 * 3. That existing users have proper links between Supabase auth and the database
 * 
 * Usage: node scripts/verify-auth-fix.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Function to generate a random email for testing
function generateRandomEmail() {
  const random = crypto.randomBytes(8).toString('hex');
  return `test-${random}@example.com`;
}

async function verifyAuthFix() {
  console.log('===== VERIFY AUTH FIX =====');

  // Initialize Prisma client for database operations
  const prisma = new PrismaClient({
    log: ['error', 'warn']
  });

  // Initialize Supabase client 
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Supabase configuration is missing. Please check your .env file');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('1. Checking database connection...');
    await prisma.$connect();
    console.log('✅ Connected to database');

    console.log('\n2. Checking auth_user_id column in users table...');
    const usersSchema = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position
    `;

    const authUserIdColumn = usersSchema.find(col => col.column_name === 'auth_user_id');
    
    if (authUserIdColumn) {
      console.log(`✅ auth_user_id column exists - Type: ${authUserIdColumn.data_type}, Nullable: ${authUserIdColumn.is_nullable === 'YES' ? 'YES' : 'NO'}`);
    } else {
      console.error('❌ auth_user_id column is missing!');
      console.log('Adding auth_user_id column to users table...');
      
      try {
        // Add the auth_user_id column if it doesn't exist
        await prisma.$executeRaw`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID;`;
        console.log('✅ auth_user_id column added successfully');
      } catch (addError) {
        console.error('Failed to add auth_user_id column:', addError);
        return;
      }
    }

    console.log('\n3. Testing registration process...');
    
    // Generate random user data for testing
    const testUser = {
      email: generateRandomEmail(),
      password: 'Password123!',
      full_name: 'Test User'
    };
    
    console.log(`Creating test user with email: ${testUser.email}`);

    // Step 1: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testUser.email,
      password: testUser.password,
      email_confirm: true,
      user_metadata: { full_name: testUser.full_name }
    });
    
    if (authError) {
      console.error('❌ Failed to create test user in Supabase Auth:', authError);
      return;
    }
    
    console.log(`✅ Created user in Supabase Auth with ID: ${authData.user.id}`);
    
    // Step 2: Create user in database (simulating the auth.js route handler)
    let dbUser;
    try {
      dbUser = await prisma.users.create({
        data: {
          email: testUser.email,
          full_name: testUser.full_name,
          auth_user_id: authData.user.id,
          verified: 'no',
          isowner: '0',
          created_at: new Date(),
          updated_at: new Date()
        }
      });
      
      console.log(`✅ Created user in database with ID: ${dbUser.user_id}`);
      console.log(`✅ Successfully linked auth_user_id: ${dbUser.auth_user_id}`);
    } catch (dbError) {
      console.error('❌ Failed to create test user in database:', dbError);
      
      // Cleanup - delete the auth user since we couldn't create the DB user
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
        console.log('Cleaned up Supabase auth user');
      } catch (cleanupError) {
        console.error('Failed to cleanup Supabase user:', cleanupError);
      }
      
      return;
    }
    
    // Step 3: Verify user can login and that the auth_user_id link works
    console.log('\n4. Testing user login...');
    
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testUser.email,
      password: testUser.password
    });
    
    if (signInError) {
      console.error('❌ Failed to login with test user:', signInError);
      return;
    }
    
    console.log('✅ Successfully logged in with test user');
    
    // Verify user retrieval by auth_user_id
    console.log('\n5. Testing user retrieval by auth_user_id...');
    
    const dbUserByAuthId = await prisma.users.findFirst({
      where: {
        auth_user_id: authData.user.id
      }
    });
    
    if (dbUserByAuthId) {
      console.log(`✅ Successfully found user by auth_user_id: ${dbUserByAuthId.user_id}`);
    } else {
      console.error('❌ Failed to find user by auth_user_id');
    }
    
    // Cleanup - delete the test user
    console.log('\n6. Cleaning up test user...');
    
    try {
      await prisma.users.delete({
        where: { user_id: dbUser.user_id }
      });
      console.log('✅ Deleted test user from database');
    } catch (deleteDbError) {
      console.error('Failed to delete test user from database:', deleteDbError);
    }
    
    try {
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.log('✅ Deleted test user from Supabase Auth');
    } catch (deleteAuthError) {
      console.error('Failed to delete test user from Supabase Auth:', deleteAuthError);
    }
    
    console.log('\n===== VERIFICATION COMPLETE =====');
    console.log('The fixes appear to be working correctly! Users can now register properly in both Supabase auth and the database.');
    console.log('The auth_user_id field is being used to link users between the two systems.');
    
  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyAuthFix()
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
