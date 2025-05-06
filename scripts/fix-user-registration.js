#!/usr/bin/env node
/**
 * User Registration Fix Script
 * 
 * This script bypasses the normal registration flow to directly create
 * a user in both the auth system and the public_users database table.
 * 
 * Usage: node scripts/fix-user-registration.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const readline = require('readline');

// Create readline interface for interactive prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function fixUserRegistration() {
  console.log('===== USER REGISTRATION FIX TOOL =====');
  console.log('This tool will help fix user registration issues by manually creating users');
  
  // Initialize Prisma client for database operations
  const prisma = new PrismaClient({
    log: ['error', 'warn']
  });
  
  // Initialize Supabase clients
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceKey)) {
    console.error('❌ Supabase configuration is missing. Please check your .env file');
    console.log('Required variables:');
    console.log('- SUPABASE_URL');
    console.log('- SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  
  // Create Supabase clients - prefer service role key for admin operations
  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
  
  console.log('\n1. Testing database connections...');
  
  try {
    // Test Prisma connection
    await prisma.$connect();
    console.log('✅ Connected to database via Prisma');
    
    // Test Supabase connection
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.warn('⚠️ Supabase auth connection warning:', authError.message);
    } else {
      console.log('✅ Connected to Supabase auth');
    }
    
    // Check for admin capabilities
    const hasAdminAccess = !!supabaseServiceKey;
    if (hasAdminAccess) {
      console.log('✅ Supabase admin access available (using service role key)');
    } else {
      console.warn('⚠️ No Supabase admin access (service role key missing)');
      console.log('Some operations may be limited');
    }
    
    // Check database schema and tables
    console.log('\n2. Inspecting database schema...');
    
    // Check public_users table
    try {
      const publicUsersSchema = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position
      `;
      
      console.log('\nFound public_users table with columns:');
      publicUsersSchema.forEach(col => {
        console.log(`- ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
      
      // Check for important fields
      const requiredFields = ['user_id', 'email', 'full_name', 'verified', 'isowner', 'created_at', 'updated_at', 'auth_user_id'];
      const missingFields = requiredFields.filter(field => 
        !publicUsersSchema.some(col => col.column_name === field)
      );
      
      if (missingFields.length > 0) {
        console.warn(`⚠️ Missing fields in public_users table: ${missingFields.join(', ')}`);
      } else {
        console.log('✅ All required fields found in public_users table');
      }
      
      // Check owner table and relationship
      try {
        const ownerSchema = await prisma.$queryRaw`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'owner' AND table_schema = 'public'
          ORDER BY ordinal_position
        `;
        
        console.log('\nFound owner table with columns:');
        ownerSchema.forEach(col => {
          console.log(`- ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
        });
      } catch (ownerError) {
        console.warn('⚠️ Could not inspect owner table:', ownerError.message);
      }
      
    } catch (schemaError) {
      console.error('❌ Failed to inspect database schema:', schemaError.message);
      return;
    }
    
    // Create a test user
    console.log('\n3. Creating a test user...');
    
    // Get user details
    const name = await prompt('Enter full name for test user: ');
    const email = await prompt('Enter email for test user: ');
    const password = await prompt('Enter password for test user: ');
    const isowner = (await prompt('Should this user be an owner? (y/n): ')).toLowerCase() === 'y';
    
    console.log('\nCreating user with the following details:');
    console.log(`- Name: ${name}`);
    console.log(`- Email: ${email}`);
    console.log(`- Password: ${'*'.repeat(password.length)}`);
    console.log(`- Owner: ${isowner ? 'Yes' : 'No'}`);
    
    const confirmCreate = await prompt('\nProceed with user creation? (y/n): ');
    if (confirmCreate.toLowerCase() !== 'y') {
      console.log('User creation canceled');
      return;
    }
    
    // Step 1: Create user in Supabase Auth
    console.log('\nStep 1: Creating user in Supabase Auth...');
    
    let authUser;
    try {
      // Try with admin API if available (service role)
      if (hasAdminAccess) {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: name, isowner: isowner ? 1 : 0 }
        });
        
        if (error) throw error;
        authUser = data;
      } else {
        // Fallback to regular signup
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, isowner: isowner ? 1 : 0 }
          }
        });
        
        if (error) throw error;
        authUser = data;
      }
      
      console.log(`✅ Auth user created successfully with ID: ${authUser.user.id}`);
    } catch (authError) {
      console.error('❌ Failed to create auth user:', authError.message);
      
      // Check if user already exists
      console.log('\nChecking if user already exists in auth...');
      try {
        // Try to sign in to see if user exists
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (!error && data && data.user) {
          console.log(`✅ User already exists in auth with ID: ${data.user.id}`);
          authUser = data;
        } else {
          console.error('❌ Could not verify existing user:', error?.message || 'Unknown error');
          return;
        }
      } catch (signInError) {
        console.error('❌ Failed to check existing user:', signInError.message);
        return;
      }
    }
    
    // Step 2: Create user in public_users table
    console.log('\nStep 2: Creating user in public_users table...');
    
    try {
      // Check if user already exists in public_users
      const existingUser = await prisma.public_users.findUnique({
        where: { email }
      });
      
      if (existingUser) {
        console.log(`✅ User already exists in public_users with ID: ${existingUser.user_id}`);
        
        // Update auth_user_id if it's missing
        if (!existingUser.auth_user_id && authUser?.user?.id) {
          await prisma.public_users.update({
            where: { user_id: existingUser.user_id },
            data: { auth_user_id: authUser.user.id }
          });
          console.log('✅ Updated auth_user_id for existing user');
        }
        
        return;
      }
      
      // Create new user in public_users
      const now = new Date();
      
      const newUser = await prisma.public_users.create({
        data: {
          full_name: name,
          email,
          verified: "true",
          isowner: isowner ? 1 : 0,
          created_at: now,
          updated_at: now,
          auth_user_id: authUser.user.id
        }
      });
      
      console.log(`✅ User created in public_users with ID: ${newUser.user_id}`);
      
      // If user is an owner, create owner record
      if (isowner) {
        console.log('\nStep 3: Creating owner record...');
        try {
          await prisma.owner.create({
            data: {
              owner_id: newUser.user_id,
              license: 'DEFAULT-LICENSE'
            }
          });
          console.log('✅ Owner record created successfully');
        } catch (ownerError) {
          console.error('❌ Failed to create owner record:', ownerError.message);
          console.log('You may need to manually create the owner record');
        }
      }
      
      console.log('\n✅ USER CREATED SUCCESSFULLY');
      console.log('\nUser details:');
      console.log(`- Auth ID: ${authUser.user.id}`);
      console.log(`- User ID: ${newUser.user_id}`);
      console.log(`- Email: ${email}`);
      console.log(`- Full Name: ${name}`);
      console.log(`- Is Owner: ${isowner ? 'Yes' : 'No'}`);
      console.log('\nYou can now try logging in with these credentials');
      
    } catch (dbError) {
      console.error('❌ Failed to create user in database:', dbError.message);
      console.log('Error details:', dbError);
    }
    
  } catch (error) {
    console.error('Failed during user registration fix:', error);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

// Run the fix
fixUserRegistration()
  .catch(console.error)
  .finally(() => process.exit(0));