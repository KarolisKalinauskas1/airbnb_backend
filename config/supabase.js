const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Check if required environment variables are set
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Required Supabase environment variables are missing:');
    console.error('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.error('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing');
    console.error('Please check your .env file');
}

// Initialize Supabase client with enhanced configuration
const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false
        },
        db: {
            schema: 'public'
        },
        global: {
            headers: {
                'x-client-info': 'airbnb-camping'
            }
        }
    }
);

// Create admin client for protected operations
const adminClient = createClient(
    supabaseUrl,
    supabaseServiceKey || supabaseAnonKey,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: false
        }
    }
);

// Add error handler to log authentication issues
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Supabase auth state changed:', event, session ? 'Session exists' : 'No session');
});

// Export configured clients and status
module.exports = {
    supabase,
    adminClient,
    isConfigured: !!(supabaseUrl && supabaseAnonKey)
};
