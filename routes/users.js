const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate, authRateLimiter } = require('../middlewares/auth');
const { adminClient } = require('../config/supabase');

// Helper function to find user by id (handles both numeric and UUID formats)
async function findUserById(userId) {try {    return await prisma.users.findUnique({
      where: {
        user_id: isNaN(userId) ? undefined : parseInt(userId)
      },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        verified: true,
        created_at: true,
        updated_at: true
      }
    });
  } catch (error) {
    console.error('Error finding user by ID:', error);
    throw error;
  }
}

/**
 * Apply rate limiting to all authentication-related endpoints
 */
router.use(['/full-info', '/basic-info', '/change-password'], authRateLimiter);

/**
 * @route   GET /api/users/full-info
 * @desc    Get full user information including bookings
 * @access  Private
 */
router.get('/full-info', authenticate, async (req, res) => {
  try {
    console.log('[/full-info] Request received:', {
      timestamp: new Date().toISOString(),
      hasUser: !!req.user,
      userId: req.user?.user_id,
      authHeader: req.headers.authorization ? 'present' : 'missing'
    });

    // Set a longer timeout for this request
    if (req.setTimeout) {
      req.setTimeout(15000);
    }
    
    // Early response if user is already in request
    if (req.user) {
      try {
        // Clean up the user object before sending
        const userData = {
          user_id: req.user.user_id,
          email: req.user.email,
          full_name: req.user.full_name,
          isowner: Number(req.user.isowner) || 0,
          verified: req.user.verified || 'no',
          bio: req.user.bio || '',
          profile_image: req.user.profile_image || null
        };
        
        return res.json(userData);
      } catch (formatError) {
        console.error('Error formatting user data:', formatError);
        return res.status(500).json({
          error: 'Data formatting error',
          message: 'Error while preparing user data',
          details: process.env.NODE_ENV === 'development' ? formatError.message : undefined
        });
      }
    }
    
    // If we don't have user data already, fetch it from DB
    try {
      const userId = req.userId || (req.user && req.user.user_id);
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'User ID not found in session or token'
        });
      }
      
      const user = await prisma.public_users.findUnique({
        where: { user_id: parseInt(userId) },
        select: { 
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          bio: true,
          verified: true,
          profile_image: true,
          created_at: true,
          updated_at: true
        }
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Format the response
      const userData = {
        ...user,
        isowner: Number(user.isowner) || 0
      };
      
      return res.json(userData);
    } catch (dbError) {
      console.error('Database error fetching user info:', dbError);
      return res.status(500).json({ 
        error: 'Database error',
        message: 'Error while retrieving user data from database'
      });
    }
  } catch (error) {
    console.error('Unhandled error in full-info endpoint:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: 'An unexpected error occurred'
    });
  }
});

/**
 * @route   GET /api/users/basic-info
 * @desc    Get user basic info without bookings
 * @access  Private
 */
router.get('/basic-info', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Return just the user without bookings
    const userData = {
      user_id: req.user.user_id,
      email: req.user.email,
      full_name: req.user.full_name,
      isowner: parseInt(req.user.isowner) || 0,
      created_at: req.user.created_at
    };
    
    res.json(userData);
  } catch (error) {
    console.error('Error fetching user basic info:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

/**
 * @route   POST /api/users
 * @desc    Create or update user
 * @access  Public (with token)
 */
router.post('/', async (req, res) => {
  console.log('\n\n==== POST /api/users REQUEST RECEIVED ====');
  console.log('Request body:', req.body);
  console.log('Headers:', {
    contentType: req.headers['content-type'],
    authorization: req.headers.authorization ? 'Present (not shown)' : 'Not present'
  });
    const { email, full_name, is_seller, license } = req.body;
  
  console.log('Parsed data:', { email, full_name, is_seller, license });
  
  if (!email) {
    console.log('ERROR: Email is required but was not provided');
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    // Look up user by email
    console.log('Looking for existing user by email:', email);
    const existing = await prisma.public_users.findUnique({ 
      where: { email }
    });
    
    if (existing) {
      console.log('Found existing user by email:', existing.user_id);
    }
    
    // If user exists, update their information
    if (existing) {
      console.log('User already exists, updating:', email);
        // Update user with new information if available
      const updatedUser = await prisma.public_users.update({
        where: { user_id: existing.user_id },
        data: {
          full_name: full_name || existing.full_name,
          isowner: is_seller === true ? '1' : existing.isowner, // Only update if becoming an owner
          updated_at: new Date()
        }
      });
      
      console.log('User updated successfully, ID:', updatedUser.user_id);
      
      // Check if user is now an owner but wasn't before
      const wasOwner = existing.isowner === '1';
      const isNowOwner = is_seller === true;
      
      // Create owner record if needed (user became an owner)
      if (isNowOwner && !wasOwner && license) {
        // Check if owner record already exists to avoid duplicates
        console.log('User became an owner, checking if owner record exists');
        const ownerExists = await prisma.owner.findUnique({
          where: { owner_id: existing.user_id }
        });
        
        if (!ownerExists) {
          console.log('Creating owner record for ID:', existing.user_id);
          await prisma.owner.create({
            data: {
              owner_id: existing.user_id,
              license: license || 'none'
            }
          });
          console.log(`Created owner record for existing user: ${existing.user_id}, license: ${license || 'none'}`);
        } else {
          console.log('Owner record already exists, not creating duplicate');
        }
      }
      
      return res.status(200).json({ 
        message: 'User updated', 
        user_id: existing.user_id,
        is_owner: updatedUser.isowner === '1'
      });
    }

    // Create new user if they don't exist
    console.log('User not found, creating new user with email:', email);    console.log('Data for new user:', {
      email,
      full_name,
      is_seller: is_seller === true ? 'true' : 'false'
    });
    
    const newUser = await prisma.public_users.create({
      data: {
        full_name: name,
        email,
        verified: "true",
        isowner: isowner ? 1 : 0,
        created_at: now,
        updated_at: now
      }
    });

    console.log(`✅ User created in public_users with ID: ${newUser.user_id}`);

    // Create owner record if user is a seller
    if (is_seller === true) {
      console.log('New user is an owner, creating owner record');
      await prisma.owner.create({
        data: {
          owner_id: newUser.user_id,
          license: license || 'none'
        }
      });
      
      console.log(`Created owner record for new user: ${newUser.user_id}, license: ${license || 'none'}`);
    }

    console.log('Registration completed successfully, sending response');
    res.status(201).json({ 
      message: 'User created', 
      user_id: newUser.user_id,
      is_owner: is_seller === true 
    });
  } catch (err) {
    console.error('==== ERROR creating/updating user ====');
    console.error(err);
    console.error('Error stack:', err.stack);
    console.error('Error details:', {
      code: err.code,
      meta: err.meta,
      message: err.message
    });
    res.status(500).json({ error: 'Failed to create/update user', details: err.message });
  }
});

/**
 * @route   POST /api/users/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {    const { currentPassword, newPassword } = req.body;
    console.log('Password change request received for user:', req.user.email);

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Both current password and new password are required'
      });
    }

    // Password requirements
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'Invalid password',
        message: 'New password must be at least 8 characters long'
      });
    }

    // Additional password validation (complexity)
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
    
    if (!(hasLetter && (hasNumber || hasSpecial))) {
      return res.status(400).json({ 
        error: 'Invalid password',
        message: 'Password must contain letters and at least one number or special character'
      });
    }

    try {      try {
        // First verify the current password with Supabase
        const { error: signInError } = await adminClient.auth.signInWithPassword({
          email: req.user.email,
          password: currentPassword
        });

        if (signInError) {
          console.log('Current password verification failed:', signInError.message);
          return res.status(401).json({ 
            error: 'Invalid password',
            message: 'Current password is incorrect'
          });
        }

        // Get the user's Supabase ID from our database
        const user = await prisma.public_users.findUnique({
          where: { email: req.user.email },
          select: {
            auth_user_id: true
          }
        });

        if (!user?.auth_user_id) {
          console.error('No auth_user_id found for user:', req.user.email);
          return res.status(500).json({ 
            error: 'Server error',
            message: 'User account not properly configured'
          });
        }

        // Update password in Supabase
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          user.auth_user_id,
          { password: newPassword }
        );        if (updateError) {
          if (updateError.status === 400) {
            // Handle invalid password format
            console.error('Invalid password format:', updateError.message);
            return res.status(400).json({ 
              error: 'Invalid password',
              message: 'Password must meet the minimum requirements: at least 6 characters long and contain letters, numbers, or special characters.'
            });
          } else {
            console.error('Failed to update password in Supabase:', updateError);
            throw updateError;
          }
        }

        console.log('Password successfully updated for user:', req.user.email);
        res.json({ 
          success: true, 
          message: 'Password successfully updated'
        });

    } catch (error) {
      console.error('Error changing password:', error);
      
      // Handle specific known errors
      if (error.status === 400) {
        return res.status(400).json({ 
          error: 'Invalid password format',
          message: 'The new password does not meet the minimum requirements. Please ensure it is at least 6 characters long and contains letters, numbers, or special characters.'
        });
      }
      
      if (error.status === 401) {
        return res.status(401).json({ 
          error: 'Authentication failed',
          message: 'Current password is incorrect.'
        });
      }
      
      // Generic error for any other cases
      res.status(500).json({ 
        error: 'Server error',
        message: 'Failed to change password. Please try again later.'
      });
    }
});

/**
 * @route   PUT /api/users/update-profile
 * @desc    Update user profile
 * @access  Private
 */ 
router.put('/update-profile', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { full_name, isowner } = req.body;
    const userId = req.user.user_id;
    
    // Input validation
    if (full_name && full_name.length > 100) {
      return res.status(400).json({ error: 'Full name is too long (max 100 characters)' });
    }
    
    if (isowner !== undefined && !['0', '1'].includes(isowner.toString())) {
      return res.status(400).json({ error: 'Invalid owner status (must be 0 or 1)' });
    }
    
    // Update in database
    const updatedUser = await prisma.public_users.update({
      where: { user_id: userId },
      data: {
        full_name: full_name || req.user.full_name,
        isowner: isowner !== undefined ? isowner.toString() : req.user.isowner,
        updated_at: new Date()
      },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        created_at: true,
        updated_at: true
      }
    });
    
    res.json({
      ...updatedUser,
      isowner: updatedUser.isowner // Keep as string '1' or '0'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * @route   GET /api/users/me
 * @desc    Get current user information
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
  console.log('GET /me request:', {
    headers: {
      authorization: req.headers.authorization ? 'present' : 'missing',
      cookie: req.headers.cookie ? 'present' : 'missing'
    },
    session: req.session ? 'present' : 'missing',
    user: req.user ? 'present' : 'missing'
  });

  // Since we have the authenticate middleware, req.user should exist
  if (!req.user) {
    console.log('No user object in request. Auth middleware state:', {
      headers: req.headers,
      session: req.session
    });
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        verified: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // If the ID is 'true' or 'false', this is likely a bug in the frontend
    if (userId === 'true' || userId === 'false') {
      // Instead of failing, let's get the current user's info
      if (!req.user?.email) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = await prisma.users.findUnique({
        where: { email: req.user.email },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          verified: true,
          created_at: true,
          updated_at: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({
        ...user,
        isowner: user.isowner === '1' ? '1' : '0'
      });
    }

    // Normal user lookup by ID
    const user = await prisma.users.findUnique({
      where: { user_id: parseInt(userId) },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        verified: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      ...user,
      isowner: user.isowner === '1' ? '1' : '0'
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;