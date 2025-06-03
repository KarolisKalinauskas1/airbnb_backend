const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client for public (frontend) use
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for backend (service role)
const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = { supabase, adminClient }; 