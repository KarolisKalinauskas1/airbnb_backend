const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
require('dotenv').config();

// Check for environment variables - try different possible key names
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || 
                    process.env.SUPABASE_ANON_KEY || 
                    process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log the environment variables for debugging
console.log('Supabase URL:', supabaseUrl ? 'Found' : 'Missing');
console.log('Supabase Key:', supabaseKey ? 'Found' : 'Missing');

// Initialize Supabase client with the key we found
let supabase;
try {
  // Only try to initialize if we have both URL and key
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized successfully');
  } else {
    throw new Error('Missing required Supabase configuration');
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error.message);
  // Create a mock client with dummy methods to prevent crashes
  supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'Supabase client not initialized' } })
    }
  };
}

// Update the authentication middleware to be more secure

const authenticate = async (req, res, next) => {
  try {
    // Extract the token from the Authorization header
    const authHeader = req.headers.authorization || ''
    
    if (!authHeader.startsWith('Bearer ')) {
      console.log('No Bearer token found in Authorization header')
      return res.status(401).json({ error: 'Authentication required' })
    }
    
    const token = authHeader.split(' ')[1]
    
    if (!token) {
      console.log('Token not provided')
      return res.status(401).json({ error: 'Authentication required' })
    }
    
    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error) {
      console.log('Token validation error:', error)
      return res.status(401).json({ error: 'Invalid token' })
    }
    
    if (!user) {
      console.log('No user found for token')
      return res.status(401).json({ error: 'User not found' })
    }
    
    // Set the user for use in the route handlers
    req.supabaseUser = user
    
    // Add a timestamp to detect when auth was performed
    req.authTimestamp = new Date().toISOString()
    
    // Continue to the next middleware or route handler
    next()
  } catch (err) {
    console.error('Authentication error:', err)
    return res.status(401).json({ error: 'Authentication failed' })
  }
}

module.exports = authenticate;
