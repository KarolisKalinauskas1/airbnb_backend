/**
 * Supabase client configuration
 * Uses environment variables for configuration
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

// Helper function to check if a URL is valid and not a placeholder
function isValidUrl(url) {
  if (!url) return false;
  
  // Check if URL is a generic placeholder
  if (url.includes('your-project') || url.includes('example.')) {
    return false;
  }
  
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// Helper function to check if a key looks valid
function isValidKey(key) {
  if (!key) return false;
  if (key.includes('your_') || key.includes('example')) return false;
  return key.length > 10; // Most Supabase keys are quite long
}

// Check if we have valid configuration
const hasValidConfig = isValidUrl(supabaseUrl) && 
                      (isValidKey(supabaseServiceKey) || isValidKey(supabaseAnonKey));

// Log configuration status
console.log('\n----- SUPABASE CONFIGURATION -----');
console.log(`URL: ${supabaseUrl || 'Not set'} (${isValidUrl(supabaseUrl) ? 'Valid' : 'Invalid'})`);
console.log(`Service Key: ${supabaseServiceKey ? '***' : 'Not set'} (${isValidKey(supabaseServiceKey) ? 'Looks valid' : 'Invalid'})`);
console.log(`Anon Key: ${supabaseAnonKey ? '***' : 'Not set'} (${isValidKey(supabaseAnonKey) ? 'Looks valid' : 'Invalid'})`);
console.log(`Overall configuration: ${hasValidConfig ? 'VALID' : 'INVALID'}`);
console.log('--------------------------------\n');

let authClient = null;
let adminClient = null;

if (isValidUrl(supabaseUrl) && isValidKey(supabaseServiceKey)) {
  try {
    adminClient = createClient(supabaseUrl, supabaseServiceKey);
    console.log('✅ Supabase admin client initialized');
  } catch (error) {
    console.error('❌ Error creating Supabase admin client:', error.message);
    throw new Error('Failed to initialize Supabase admin client: ' + error.message);
  }
} else {
  console.error('⚠️ Supabase admin client not initialized - missing or invalid URL/SERVICE_KEY');
  throw new Error('Supabase admin client configuration is invalid or missing');
}

if (isValidUrl(supabaseUrl) && isValidKey(supabaseAnonKey)) {
  try {
    authClient = createClient(supabaseUrl, supabaseAnonKey);
    console.log('✅ Supabase auth client initialized');
  } catch (error) {
    console.error('❌ Error creating Supabase auth client:', error.message);
    throw new Error('Failed to initialize Supabase auth client: ' + error.message);
  }
} else {
  console.error('⚠️ Supabase auth client not initialized - missing or invalid URL/ANON_KEY');
  throw new Error('Supabase auth client configuration is invalid or missing');
}

module.exports = {
  authClient,
  adminClient,
  isConfigured: hasValidConfig
};
