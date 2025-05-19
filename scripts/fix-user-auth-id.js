/**
 * Script to fix users with missing auth_user_id
 * This is important for password reset to work correctly
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const prisma = require('../src/config/prisma');
const { adminClient } = require('../config/supabase');

async function fixUsers() {
  try {
    console.log('Finding users with missing auth_user_id...');
    
    // Find users with missing auth_user_id
    const users = await prisma.public_users.findMany({
      where: {
        OR: [
          { auth_user_id: null },
          { auth_user_id: '' }
        ],
        email: { not: null }
      }
    });
    
    console.log(`Found ${users.length} users with missing auth_user_id`);
    
    if (users.length === 0) {
      console.log('No users to fix. All users have auth_user_id set.');
      return;
    }
    
    // Process each user
    for (const user of users) {
      console.log(`Processing user: ${user.email} (ID: ${user.user_id})`);
      
      try {
        // Look up the user in Supabase by email
        console.log(`Looking up user in Supabase by email: ${user.email}`);
        const { data, error } = await adminClient.auth.admin.listUsers();
        
        if (error) {
          console.error(`Error looking up users in Supabase: ${error.message}`);
          continue;
        }
        
        // Find the user by email
        const supabaseUser = data.users.find(u => u.email === user.email);
        
        if (supabaseUser) {
          console.log(`Found matching Supabase user with ID: ${supabaseUser.id}`);
          
          // Update the user record
          await prisma.public_users.update({
            where: { user_id: user.user_id },
            data: { auth_user_id: supabaseUser.id }
          });
          
          console.log(`✅ Updated user ${user.email} with auth_user_id: ${supabaseUser.id}`);
        } else {
          console.log(`❌ No matching Supabase user found for email: ${user.email}`);
        }
      } catch (userError) {
        console.error(`Error processing user ${user.email}: ${userError.message}`);
      }
    }
    
    console.log('User fix process complete!');
  } catch (error) {
    console.error('Error fixing users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixUsers();
