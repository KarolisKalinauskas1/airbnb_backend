const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Validation
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: Missing Supabase environment variables')
  console.error('Please check your .env file and ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
  // Instead of crashing, we'll provide placeholder values that will fail gracefully
  // This helps identify the issue in the logs rather than crashing at startup
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseServiceKey || 'placeholder_key'
)

module.exports = supabase
