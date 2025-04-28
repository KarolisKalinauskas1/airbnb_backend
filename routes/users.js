const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate, authRateLimiter } = require('../middleware/auth');

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
  const { email, full_name, is_seller, license, auth_user_id } = req.body;
  
  console.log('Creating/updating user:', { email, full_name, is_seller, auth_user_id });
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    // First try to find by auth_user_id if provided
    let existing = null;
    if (auth_user_id) {
      existing = await prisma.public_users.findFirst({ 
        where: { auth_user_id }
      });
    }
    
    // If not found by auth_user_id, try by email
    if (!existing) {
      existing = await prisma.public_users.findUnique({ 
        where: { email }
      });
    }
    
    // If user exists, update their information
    if (existing) {
      console.log('User already exists, updating:', email);
      
      // Update user with new information if available
      const updatedUser = await prisma.public_users.update({
        where: { user_id: existing.user_id },
        data: {
          full_name: full_name || existing.full_name,
          auth_user_id: auth_user_id || existing.auth_user_id, // Ensure auth_user_id is set
          isowner: is_seller === true ? '1' : existing.isowner, // Only update if becoming an owner
          updated_at: new Date()
        }
      });
      
      // Check if user is now an owner but wasn't before
      const wasOwner = existing.isowner === '1';
      const isNowOwner = is_seller === true;
      
      // Create owner record if needed (user became an owner)
      if (isNowOwner && !wasOwner && license) {
        // Check if owner record already exists to avoid duplicates
        const ownerExists = await prisma.owner.findUnique({
          where: { owner_id: existing.user_id }
        });
        
        if (!ownerExists) {
          await prisma.owner.create({
            data: {
              owner_id: existing.user_id,
              license: license || 'none'
            }
          });
          console.log(`Created owner record for existing user: ${existing.user_id}, license: ${license || 'none'}`);
        }
      }
      
      return res.status(200).json({ 
        message: 'User updated', 
        user_id: existing.user_id,
        is_owner: updatedUser.isowner === '1'
      });
    }

    // Create new user if they don't exist
    const newUser = await prisma.public_users.create({
      data: {
        email,
        full_name: full_name || email.split('@')[0],
        date_of_birth: 'unknown',
        verified: 'yes', // Mark as verified since we're skipping email verification
        isowner: is_seller === true ? '1' : '0', // Ensure boolean comparison
        created_at: new Date(),
        updated_at: new Date(),
        auth_user_id: auth_user_id // Store the Supabase user ID
      }
    });

    // Create owner record if user is a seller
    if (is_seller === true) {
      await prisma.owner.create({
        data: {
          owner_id: newUser.user_id,
          license: license || 'none'
        }
      });
      
      console.log(`Created owner record for new user: ${newUser.user_id}, license: ${license || 'none'}`);
    }

    res.status(201).json({ 
      message: 'User created', 
      user_id: newUser.user_id,
      is_owner: is_seller === true 
    });
  } catch (err) {
    console.error('Error creating/updating user:', err);
    res.status(500).json({ error: 'Failed to create/update user', details: err.message });
  }
});

/**
 * @route   POST /api/users/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    
    // Password strength validation
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    // Validate password complexity
    const hasLetter = /[a-zA-Z]/.test(new_password);
    const hasNumber = /\d/.test(new_password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(new_password);
    
    if (!(hasLetter && (hasNumber || hasSpecial))) {
      return res.status(400).json({ 
        error: 'Password must contain letters and at least one number or special character'
      });
    }
    
    // Password change is handled by Supabase on the frontend
    // Here we just acknowledge the request
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
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
    
    if (isowner !== undefined && ![0, 1].includes(parseInt(isowner))) {
      return res.status(400).json({ error: 'Invalid owner status (must be 0 or 1)' });
    }
    
    // Update in database
    const updatedUser = await prisma.public_users.update({
      where: { user_id: userId },
      data: {
        full_name: full_name || req.user.full_name,
        isowner: isowner !== undefined ? isowner : req.user.isowner,
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
      isowner: parseInt(updatedUser.isowner)
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;