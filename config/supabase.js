/**
 * Supabase Client Configuration - Fixed Version
 * 
 * This file provides different Supabase clients based on the access level needed
 * while preventing circular dependencies.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Extract environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

// Log missing configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: Missing required Supabase configuration!');
  console.error(`SUPABASE_URL: ${supabaseUrl ? 'Found' : 'MISSING'}`);
  console.error(`SUPABASE_ANON_KEY: ${supabaseAnonKey ? 'Found' : 'MISSING'}`);
}

// Create admin client using service role - ADMIN OPERATIONS ONLY
const adminClient = supabaseServiceKey ? createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseServiceKey
) : null;

// Create auth client using anon key - FOR USER AUTHENTICATION
const authClient = supabaseAnonKey ? createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey
) : null;

// Export only what's needed to prevent circular references
module.exports = {
  adminClient,     // For server-side admin operations
  authClient,      // For user authentication
  supabaseUrl      // For reference in other parts of the app
};
