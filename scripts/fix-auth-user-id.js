/**
 * This script fixes user records in the database by ensuring they 
 * have the correct auth_user_id (UUID from Supabase) stored.
 * 
 * Run this if your application has authentication issues with 
 * Supabase auth system and your local user records.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use the service key for admin access
);

async function main() {
  console.log('Starting user auth ID fix script...');

  try {
    // Get all users from Supabase Auth
    const { data: supabaseUsers, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      throw new Error(`Error fetching Supabase users: ${error.message}`);
    }
    
    console.log(`Found ${supabaseUsers.users.length} users in Supabase Auth`);

    // Get all users from our database
    const dbUsers = await prisma.public_users.findMany({
      select: {
        user_id: true,
        email: true,
        auth_user_id: true
      }
    });
    
    console.log(`Found ${dbUsers.length} users in our database`);

    // Match Supabase users with our database users by email
    let updatedCount = 0;
    let missingCount = 0;
    
    for (const dbUser of dbUsers) {
      const supabaseUser = supabaseUsers.users.find(u => u.email === dbUser.email);
      
      if (supabaseUser) {
        if (dbUser.auth_user_id !== supabaseUser.id) {
          // Update our user record with the Supabase UUID
          await prisma.public_users.update({
            where: { user_id: dbUser.user_id },
            data: { auth_user_id: supabaseUser.id }
          });
          
          console.log(`Updated user ${dbUser.email}: set auth_user_id to ${supabaseUser.id}`);
          updatedCount++;
        } else {
          console.log(`User ${dbUser.email} already has correct auth_user_id`);
        }
      } else {
        console.log(`No matching Supabase auth user found for ${dbUser.email}`);
        missingCount++;
      }
    }

    console.log(`Updated ${updatedCount} users with correct auth_user_id`);
    console.log(`${missingCount} users had no matching Supabase auth record`);

  } catch (error) {
    console.error('Error fixing user auth IDs:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log('User auth ID fix script completed successfully');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
