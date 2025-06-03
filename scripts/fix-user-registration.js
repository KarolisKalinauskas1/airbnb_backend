#!/usr/bin/env node
/**
 * User Registration Fix Script
 * 
 * This script helps fix user registration issues by:
 * 1. Creating test users manually
 * 2. Syncing all users from Supabase Auth to the public users table
 * 3. Fixing specific users by email
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
      const requiredFields = ['user_id', 'email', 'full_name', 'verified', 'isowner', 'created_at', 'updated_at'];
      const missingFields = requiredFields.filter(field => 
        !publicUsersSchema.some(col => col.column_name === field)
      );
      
      if (missingFields.length > 0) {
        console.warn(`⚠️ Missing fields in public_users table: ${missingFields.join(', ')}`);
      } else {
        console.log('✅ All required fields found in public_users table');
      }
      
      // Check for auth_user_id field (optional but recommended)
      if (!publicUsersSchema.some(col => col.column_name === 'auth_user_id')) {
        console.log('ℹ️ Note: The auth_user_id field is not present in the users table.');
        console.log('    This is not required, but adding it would improve user management.');
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
    
    // Offer various operations
    console.log('\n3. Choose an operation:');
    console.log('1. Create a new test user');
    console.log('2. Sync all Supabase users to public users table');
    console.log('3. Fix a specific user by email');
    console.log('4. Exit');
    
    const operation = await prompt('Enter your choice (1-4): ');
    
    if (operation === '1') {
      // Create a new user
      console.log('\n--- Create New User ---');
      
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
              data: {
                full_name: name,
                isowner: isowner ? 1 : 0
              }
            }
          });
          
          if (error) throw error;
          authUser = data;
        }
        
        console.log('✅ User created in Supabase Auth');
      } catch (authError) {
        // Check if user already exists
        if (authError.message?.includes('already exists')) {
          console.log('⚠️ User already exists in Supabase Auth');
          // Try to get existing user
          const { data, error } = await supabase.auth.admin.getUserByEmail(email);
          if (error) {
            console.error('❌ Failed to fetch existing user:', error.message);
            return;
          }
          authUser = data;
        } else {
          console.error('❌ Failed to create user in Supabase Auth:', authError.message);
          return;
        }
      }
      
      // Step 2: Create user in our database
      console.log('\nStep 2: Creating user in public_users table...');
      
      try {
        // Check if user already exists
        const existingUser = await prisma.users.findFirst({
          where: { email }
        });
        
        if (existingUser) {
          console.log('⚠️ User already exists in the database with ID:', existingUser.user_id);
          return;
        }
        
        // Create new user
        const newUser = await prisma.users.create({
          data: {
            email,
            full_name: name,
            verified: 'yes',
            isowner: isowner ? '1' : '0',
            created_at: new Date(),
            updated_at: new Date()
          }
        });
        
        console.log(`✅ User created in database with ID: ${newUser.user_id}`);
        
        // Step 3: Create owner record if needed
        if (isowner) {
          console.log('\nStep 3: Creating owner record...');
          
          try {
            await prisma.owner.create({
              data: {
                owner_id: newUser.user_id,
                license: 'test-license'
              }
            });
            console.log('✅ Owner record created');
          } catch (ownerError) {
            console.error('❌ Failed to create owner record:', ownerError.message);
          }
        }
        
        console.log('\n✅ User creation complete!');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log('You can now log in with these credentials.');
        
      } catch (dbError) {
        console.error('❌ Failed to create user in database:', dbError.message);
        
        // Try to rollback Supabase user creation
        if (hasAdminAccess && authUser?.user?.id) {
          console.log('Attempting to rollback Supabase user creation...');
          
          try {
            await supabase.auth.admin.deleteUser(authUser.user.id);
            console.log('✅ Rolled back Supabase user creation');
          } catch (rollbackError) {
            console.error('❌ Failed to rollback Supabase user:', rollbackError.message);
          }
        }
      }
    } else if (operation === '2') {
      // Sync all users
      console.log('\n--- Sync All Users ---');
      
      if (!hasAdminAccess) {
        console.error('❌ This operation requires admin access (service role key)');
        return;
      }
      
      // Get all users from Supabase Auth
      console.log('Fetching all users from Supabase Auth...');
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error('❌ Failed to list Supabase users:', listError.message);
        return;
      }
      
      console.log(`Found ${authUsers.users.length} users in Supabase Auth`);
      
      // Get all users from public_users table
      console.log('Fetching all users from public_users table...');
      const dbUsers = await prisma.users.findMany({
        select: { email: true, user_id: true }
      });
      
      console.log(`Found ${dbUsers.length} users in public_users table`);
      
      // Find users in Supabase but not in DB
      const dbEmails = new Set(dbUsers.map(u => u.email.toLowerCase()));
      const missingUsers = authUsers.users.filter(u => !dbEmails.has(u.email.toLowerCase()));
      
      console.log(`Found ${missingUsers.length} users missing from public_users table`);
      
      if (missingUsers.length === 0) {
        console.log('✅ All users are already synchronized');
        return;
      }
      
      const confirmSync = await prompt(`Proceed with creating ${missingUsers.length} users in the database? (y/n): `);
      if (confirmSync.toLowerCase() !== 'y') {
        console.log('Sync canceled');
        return;
      }
      
      console.log('\nCreating missing users in public_users table:');
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const authUser of missingUsers) {
        try {
          // Create user in public_users
          const newUser = await prisma.users.create({
            data: {
              email: authUser.email,
              full_name: authUser.user_metadata?.full_name || authUser.email.split('@')[0],
              verified: authUser.email_confirmed_at ? 'yes' : 'no',
              isowner: authUser.user_metadata?.isowner === 1 || authUser.user_metadata?.isowner === '1' ? '1' : '0',
              created_at: new Date(),
              updated_at: new Date()
            }
          });
          
          console.log(`✅ Created user: ${authUser.email} (ID: ${newUser.user_id})`);
          successCount++;
          
          // If user is an owner, create owner record
          if (authUser.user_metadata?.isowner === 1 || authUser.user_metadata?.isowner === '1') {
            try {
              await prisma.owner.create({
                data: {
                  owner_id: newUser.user_id,
                  license: 'auto-created'
                }
              });
              console.log(`  ✅ Created owner record for user: ${authUser.email}`);
            } catch (ownerError) {
              if (ownerError.code === 'P2002') {
                console.warn(`  ⚠️ Owner record already exists for ID ${newUser.user_id}`);
              } else {
                console.warn(`  ⚠️ Failed to create owner record: ${ownerError.message}`);
              }
            }
          }
        } catch (userError) {
          console.error(`❌ Failed to create user ${authUser.email}: ${userError.message}`);
          errorCount++;
        }
      }
      
      console.log(`\n✅ Sync complete: ${successCount} users created, ${errorCount} failures`);
    } else if (operation === '3') {
      // Fix specific user
      console.log('\n--- Fix Specific User ---');
      
      const email = await prompt('Enter email of user to fix: ');
      console.log(`\nLooking up user: ${email}...`);
      
      // Check if user exists in Supabase
      console.log('Checking Supabase Auth...');
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserByEmail(email);
      
      if (authError || !authUser?.user) {
        console.error('❌ User not found in Supabase Auth');
        const createInSupabase = await prompt('Do you want to create this user in Supabase Auth? (y/n): ');
        
        if (createInSupabase.toLowerCase() === 'y') {
          const password = await prompt('Enter password for new user: ');
          const fullName = await prompt('Enter full name for user: ');
          const isowner = (await prompt('Should this user be an owner? (y/n): ')).toLowerCase() === 'y';
          
          // Create user in Supabase
          try {
            const { data, error } = await supabase.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { 
                full_name: fullName,
                isowner: isowner ? 1 : 0 
              }
            });
            
            if (error) throw error;
            console.log('✅ Created user in Supabase Auth');
          } catch (createError) {
            console.error('❌ Failed to create user in Supabase:', createError.message);
            return;
          }
        } else {
          return;
        }
      } else {
        console.log('✅ Found user in Supabase Auth');
      }
      
      // Check if user exists in DB
      console.log('Checking public_users table...');
      const dbUser = await prisma.users.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } }
      });
      
      if (dbUser) {
        console.log('✅ User exists in public_users table with ID:', dbUser.user_id);
        
        // Check if user is supposed to be an owner
        let supabaseUserData;
        try {
          const { data, error } = await supabase.auth.admin.getUserByEmail(email);
          if (!error && data?.user) {
            supabaseUserData = data.user;
          }
        } catch (error) {
          console.warn('⚠️ Could not fetch user metadata from Supabase');
        }
        
        const isOwnerInSupabase = supabaseUserData?.user_metadata?.isowner === 1 || 
                                supabaseUserData?.user_metadata?.isowner === '1';
        const isOwnerInDb = dbUser.isowner === '1' || dbUser.isowner === 1;
        
        if (isOwnerInSupabase !== isOwnerInDb) {
          console.log('⚠️ Owner status mismatch between Supabase and database:');
          console.log(`   - Supabase: ${isOwnerInSupabase ? 'Owner' : 'Not owner'}`);
          console.log(`   - Database: ${isOwnerInDb ? 'Owner' : 'Not owner'}`);
          
          const updateOwner = await prompt('Do you want to update the database to match Supabase? (y/n): ');
          if (updateOwner.toLowerCase() === 'y') {
            try {
              await prisma.users.update({
                where: { user_id: dbUser.user_id },
                data: { isowner: isOwnerInSupabase ? '1' : '0' }
              });
              
              console.log('✅ Updated isowner status in database');
              
              // Create/delete owner record if needed
              if (isOwnerInSupabase) {
                try {
                  await prisma.owner.upsert({
                    where: { owner_id: dbUser.user_id },
                    update: {},
                    create: { owner_id: dbUser.user_id, license: 'auto-created' }
                  });
                  console.log('✅ Created/updated owner record');
                } catch (ownerError) {
                  console.error('❌ Failed to create/update owner record:', ownerError.message);
                }
              }
            } catch (updateError) {
              console.error('❌ Failed to update owner status:', updateError.message);
            }
          }
        } else {
          console.log('✅ Owner status matches between Supabase and database');
        }
        
        console.log('\nNo further action needed for this user.');
        return;
      }
      
      console.log('❌ User not found in public_users table');
      const createInDb = await prompt('Do you want to create this user in the database? (y/n): ');
      
      if (createInDb.toLowerCase() !== 'y') {
        return;
      }
      
      // Get user metadata
      let fullName = '';
      let isowner = false;
      
      try {
        const { data } = await supabase.auth.admin.getUserByEmail(email);
        if (data?.user) {
          fullName = data.user.user_metadata?.full_name || '';
          isowner = data.user.user_metadata?.isowner === 1 || data.user.user_metadata?.isowner === '1';
        }
      } catch (error) {
        // Ignore errors and use default values
      }
      
      fullName = fullName || await prompt('Enter full name for user: ');
      
      if (!isowner) {
        isowner = (await prompt('Should this user be an owner? (y/n): ')).toLowerCase() === 'y';
      }
      
      // Create user in public_users
      try {
        const newUser = await prisma.users.create({
          data: {
            email: email,
            full_name: fullName,
            verified: 'yes',
            isowner: isowner ? '1' : '0',
            created_at: new Date(),
            updated_at: new Date()
          }
        });
        
        console.log(`✅ Created user in database with ID: ${newUser.user_id}`);
        
        // Create owner record if needed
        if (isowner) {
          try {
            await prisma.owner.create({
              data: {
                owner_id: newUser.user_id,
                license: 'auto-created'
              }
            });
            console.log('✅ Created owner record');
          } catch (ownerError) {
            console.error('❌ Failed to create owner record:', ownerError.message);
          }
        }
      } catch (createError) {
        console.error('❌ Failed to create user in database:', createError.message);
      }
    } else if (operation === '4') {
      // Exit
      console.log('Exiting...');
    } else {
      console.log('Invalid option selected');
    }
    
  } catch (error) {
    console.error(`\n❌ An unexpected error occurred: ${error.message}`);
    console.error(error.stack);
  } finally {
    // Close connection and readline interface
    await prisma.$disconnect();
    rl.close();
  }
}

// Run the script
fixUserRegistration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});