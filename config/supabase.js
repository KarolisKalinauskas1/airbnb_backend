const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Check if Supabase is configured correctly
const isConfigured = supabaseUrl && 
                    (supabaseAnonKey || supabaseServiceKey) && 
                    supabaseUrl.includes('supabase');

// Initialize clients
let adminClient = null;
let publicClient = null;

try {
  if (isConfigured) {
    // Create admin client with service role key for server-side operations
    if (supabaseServiceKey) {
      adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      console.log('Supabase admin client initialized');
    } else {
      console.warn('No Supabase service key available. Admin operations will be limited.');
    }
    
    // Create public client with anon key for client operations
    if (supabaseAnonKey) {
      publicClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      console.log('Supabase public client initialized');
    } else {
      console.warn('No Supabase anon key available. Public operations will be limited.');
    }
  } else {
    console.warn('Supabase configuration is incomplete. Check your environment variables.');
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error.message);
}

/**
 * Test the Supabase connection
 * @returns {Promise<Object>} Connection status
 */
async function testConnection() {
  if (!adminClient && !publicClient) {
    return { 
      configured: false, 
      error: 'Supabase clients not initialized'
    };
  }
  
  try {
    const client = adminClient || publicClient;
    const { data, error } = await client.auth.getSession();
    
    if (error) throw error;
    
    return {
      configured: true,
      connected: true,
      serviceKeyAvailable: !!adminClient,
      anonKeyAvailable: !!publicClient
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      error: error.message
    };
  }
}

module.exports = {
  adminClient,
  publicClient,
  isConfigured,
  testConnection
};
