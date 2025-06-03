const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with enhanced configuration
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
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

// Add error handler to log authentication issues
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Supabase auth state changed:', event, session ? 'Session exists' : 'No session');
});

module.exports = supabase;
