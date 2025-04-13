const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware to protect route with Supabase JWT
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'Missing token' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.log('Token validation error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (!user) {
      console.log('No user found for token');
      return res.status(401).json({ error: 'User not found' });
    }

    req.supabaseUser = user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { authenticate, prisma, supabase };
