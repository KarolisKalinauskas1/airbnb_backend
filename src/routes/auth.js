const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// Fix the import to use the correct prisma client
const { prisma } = require('../config/prisma');
const { ValidationError } = require('../middleware/error');
const { verifyToken, jwtConfig } = require('../config');
// Fixed import for Supabase - import from correct path with correct exports
const { adminClient: supabaseAdmin } = require('../../config/supabase');
// Import the user schemas
const { registerUserSchema, loginUserSchema } = require('../../schemas/user-schemas');
// Import adminClient from the correct location for user creation
const { adminClient } = require('../../config/supabase');
const { createOwnerRecord } = require('../utils/owner-helpers');

// Import OAuth routes
const oauthRoutes = require('./auth/oauth/supabase-callback');

// Mount OAuth routes
router.use('/oauth', oauthRoutes);

/**
 * Helper function to create owner record if needed
 */
async function createOwnerIfNeeded(userId, license = 'none') {
  // Input validation
  if (!userId) {
    console.error('Cannot create owner record: Missing userId');
    return false;
  }

  // Ensure userId is a number
  const ownerId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
  
  if (isNaN(ownerId)) {
    console.error('Cannot create owner record: Invalid userId format', { userId });
    return false;
  }

  // Normalize license value
  const normalizedLicense = license && license !== '' ? license : 'none';

  console.log('Creating/verifying owner record:', {
    userId: ownerId,
    license: normalizedLicense,
    originalUserId: userId,
    originalLicense: license
  });

  try {
    // First verify the user exists
    const user = await prisma.users.findUnique({
      where: { user_id: ownerId }
    });

    if (!user) {
      console.error(`Cannot create owner record: User ${ownerId} not found in users table`);
      return false;
    }

    // Check if owner record already exists
    const existingOwner = await prisma.owner.findUnique({
      where: { owner_id: ownerId }
    });
    
    if (!existingOwner) {
      // Create new owner record
      await prisma.owner.create({
        data: {
          owner_id: ownerId,
          license: normalizedLicense
        }
      });
      console.log(`Created owner record for user ${ownerId} with license: ${normalizedLicense}`);

      // Update user record to ensure isowner is set
      await prisma.users.update({
        where: { user_id: ownerId },
        data: { isowner: '1' }
      });
      console.log(`Updated user ${ownerId} isowner status to 1`);
    } else {
      console.log(`Owner record exists for user ${ownerId}`);
      
      // Update license if different
      if (normalizedLicense !== existingOwner.license) {
        await prisma.owner.update({
          where: { owner_id: ownerId },
          data: { license: normalizedLicense }
        });
        console.log(`Updated license for owner ${ownerId} from "${existingOwner.license}" to "${normalizedLicense}"`);
      }

      // Ensure user record shows as owner
      if (user.isowner !== '1') {
        await prisma.users.update({
          where: { user_id: ownerId },
          data: { isowner: '1' }
        });
        console.log(`Corrected user ${ownerId} isowner status to 1`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to create/verify owner record:', {
      userId: ownerId,
      error: error.message,
      code: error.code,
      meta: error.meta
    });
    return false;
  }
}

/**
 * Check if Supabase is configured
 */
const isConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

/**
 * @route   POST /api/auth/register
 * @desc    Register user and create session (unified registration endpoint)
 * @access  Public
 */
router.post('/register', async (req, res, next) => {
  try {
    console.log('\n\n==== POST /api/auth/register ENDPOINT CALLED ====');
    
    // Map the frontend fields to backend expected fields
    // Check if fullName was sent as name (frontend) instead of full_name (backend expected)
    if (req.body.name && !req.body.full_name) {
      req.body.full_name = req.body.name;
    }
    
    // Normalize owner status from all possible fields
    const isOwner = req.body.is_seller === '1' || 
                    req.body.is_seller === true || 
                    req.body.is_seller === 1 ||
                    req.body.isowner === '1' || 
                    req.body.isowner === true || 
                    req.body.isowner === 1;
    
    req.body.is_seller = isOwner;
    
    // Log the received data after normalization
    console.log('Registration endpoint called with data:', { 
      email: req.body.email,
      has_password: !!req.body.password,
      full_name: req.body.full_name,
      is_seller: req.body.is_seller,
      license: req.body.license
    });
    
    // Apply schema validation after field mapping
    try {
      registerUserSchema.parse(req.body);
    } catch (validationError) {
      console.error('Validation error:', validationError.errors);
      return res.status(400).json({ 
        error: 'Invalid registration data', 
        details: validationError.errors.map(e => e.message) 
      });
    }
    
    if (!isConfigured) {
      console.log('ERROR: Supabase is not configured');
      const error = new Error('Authentication service not configured');
      error.status = 503;
      throw error;
    }

    const { email, password, full_name, license } = req.body;
    
    // Check if user already exists in our database
    console.log('Checking if user already exists in users table...');
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      console.log('User already exists in public_users table:', existingUser.user_id);
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    console.log('Creating user in Supabase...');
    // Create user in Supabase
    const { data, error } = await adminClient.auth.signUp({
      email,
      password,
      options: {
        data: { 
          full_name,
          isowner: isOwner ? 1 : 0
        }
      }
    });
    
    if (error) {
      console.error('Supabase signup error:', error);
      throw error;
    }
    
    if (!data?.user) {
      console.error('No user data returned from Supabase');
      const error = new Error('Failed to create user in authentication service');
      error.status = 500;
      throw error;
    }
    
    console.log('Supabase user created successfully, ID:', data.user.id);
    
    // Create user in our database
    let user;
    try {
      console.log('Creating user in public_users table...');
      
      // Create user with transaction to ensure both user and owner records are created
      user = await prisma.$transaction(async (prisma) => {
        // Create the user
        const newUser = await prisma.users.create({
          data: {
            email,
            full_name,
            verified: 'no',
            isowner: isOwner ? '1' : '0', 
            created_at: new Date(),
            updated_at: new Date(),
            auth_user_id: data.user.id 
          }
        });

        // Create owner record if needed
        if (isOwner) {
          try {
            const ownerCreated = await createOwnerRecord(newUser.user_id, license);
            if (!ownerCreated) {
              throw new Error('Failed to create owner record');
            }
            console.log('Created owner record for user:', newUser.user_id);
          } catch (ownerError) {
            console.error('Failed to create owner record:', ownerError);
            throw ownerError; // This will rollback the transaction
          }
        }

        return newUser;
      });

      console.log('User created in public_users table, ID:', user.user_id);

      // Send welcome email
      try {
        const EmailService = require('../shared/services/email.service');
        await EmailService.sendWelcomeEmail(user);
        console.log('Welcome email sent to', user.email);
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Don't fail registration if email fails
      }
      
      // Set up session if available
      if (req.session) {
        console.log('Setting up user session...');
        req.session.userId = user.user_id;
        req.session.email = user.email;
        req.session.isowner = user.isowner; 
        req.session.auth_user_id = user.auth_user_id;
        console.log('Session created successfully');
      } else {
        console.log('Warning: Session object is not available');
      }
      
      console.log('Registration successful, returning response');
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          isowner: user.isowner
        },
        session: req.session ? {
          userId: user.user_id,
          email: user.email,
          authenticated: true
        } : undefined
      });
    } catch (dbError) {
      console.error('Database error during registration:', dbError);
      console.error('Error details:', dbError.stack);
      console.error('Prisma error code:', dbError.code);
      console.error('Prisma error meta:', dbError.meta);
      
      try {
        console.log('Cleaning up Supabase user after DB error...');
        await adminClient.auth.admin.deleteUser(data.user.id);
        console.log('Supabase user deleted successfully');
      } catch (deleteError) {
        console.error('Failed to clean up Supabase user after DB error:', deleteError);
      }
      
      // Check if this is a unique constraint violation (user already exists)
      if (dbError.code === 'P2002') {
        return res.status(400).json({ 
          error: 'User with this email already exists',
          details: 'A user with this email is already registered'
        });
      }
      
      throw dbError;
    }
  } catch (error) {
    console.error('Registration error:', error);
    
    if (!res.headersSent) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ 
        error: 'Registration failed',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
      });
    }
    
    next(error);
  }
});

// Login user
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);

    // Validate input
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }    // Step 1: First check if user exists in users table
    const publicUser = await prisma.users.findUnique({
      where: { email }
    });

    if (!publicUser) {
      console.log('User not found in users database');
      throw new ValidationError('Invalid credentials');
    }

    // Step 2: Authenticate via Supabase (which has the password)
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Supabase authentication failed:', error.message);
      throw new ValidationError('Invalid credentials');
    }

    console.log('Supabase authentication successful');

    // Step 3: Generate JWT token
    const token = jwt.sign(
      { 
        id: publicUser.user_id,
        email: publicUser.email,
        isowner: publicUser.isowner 
      },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', email);

    res.json({
      user: {
        user_id: publicUser.user_id,
        full_name: publicUser.full_name,
        email: publicUser.email,
        isowner: Number(publicUser.isowner) || 0,
        verified: publicUser.verified
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
});

/**
 * @route   POST /api/auth/sync-session
 * @desc    Sync session with backend and return user data
 * @access  Public
 */
router.post('/sync-session', async (req, res) => {
  try {
    console.log('Sync session request received');
    
    // Get token from various sources with fallbacks
    const token = 
      req.headers.authorization?.replace('Bearer ', '') || 
      req.cookies?.token || 
      req.body?.token;

    if (!token) {
      console.log('No token provided in sync-session');
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify and decode the JWT token
    try {
      console.log('Verifying token in sync-session');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.sub) {
        console.log('Invalid token decoded in sync-session');
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get user from database using the subject (user ID)
      console.log(`Looking up user with ID: ${decoded.sub}`);      const user = await prisma.users.findFirst({
        where: {
          OR: [
            { user_id: decoded.sub },
            { email: decoded.email }
          ]
        },
        select: {
          user_id: true,
          email: true,
          full_name: true,
          isowner: true,
          verified: true,
          auth_user_id: true
        }
      });

      if (!user) {
        console.log('User not found in database during sync-session');
        return res.status(401).json({ error: 'User not found' });
      }

      // Update session if it exists
      if (req.session) {
        req.session.userId = user.user_id;
        req.session.email = user.email;
        req.session.isowner = user.isowner;
        req.session.auth_user_id = user.auth_user_id;
      }

      // Generate a new token if the current one is close to expiring
      const tokenExp = decoded.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const refreshThreshold = 24 * 60 * 60 * 1000; // 24 hours
      
      let newToken = null;
      if (tokenExp - now < refreshThreshold) {
        newToken = jwt.sign(
          { 
            sub: user.auth_user_id || user.user_id,
            email: user.email,
            name: user.full_name 
          },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
      }

      console.log('Session sync successful for user:', user.email);
      
      // Return user data with optional new token
      res.json({
        user: {
          user_id: user.user_id,
          email: user.email,
          full_name: user.full_name,
          isowner: Number(user.isowner) || 0,
          verified: user.verified
        },
        ...(newToken ? { token: newToken } : {}),
        sessionRestored: true
      });
    } catch (jwtError) {
      console.error('JWT verification failed in sync-session:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Session sync error:', error);
    res.status(500).json({ error: 'Internal server error during session sync' });
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh an expired JWT token
 * @access  Public
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify the token (but ignore expiration)
    const decoded = jwt.verify(token, jwtConfig.secret, { ignoreExpiration: true });    // Get user from database - fixed to use users model for consistency
    const user = await prisma.users.findUnique({
      where: {
        email: decoded.email
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new token
    const newToken = jwt.sign(
      { 
        id: user.user_id,
        email: user.email,
        isowner: user.isowner 
      },
      jwtConfig.secret,
      { expiresIn: '24h' }
    );

    res.json({
      token: newToken,
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner) || 0,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', async (req, res) => {
  const { currentPassword, newPassword, email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ 
        error: 'Missing email',
        message: 'Email is required to change password' 
      });
    }

    // Find user by email
    const user = await prisma.users.findUnique({
      where: { email: email }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // First verify the current password by attempting to sign in with Supabase
    const { error: signInError } = await adminClient.auth.signInWithPassword({
      email,
      password: currentPassword
    });
    
    if (signInError) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        message: 'The current password you entered is incorrect'
      });
    }
    
    // Update the password in Supabase
    const { data: supabaseUser } = await adminClient.auth.admin.getUserById(
      user.user_id.toString()
    );
    
    if (!supabaseUser) {
      return res.status(404).json({
        error: 'Supabase user not found',
        message: 'Could not find user in authentication service'
      });
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      user.user_id.toString(),
      { password: newPassword }
    );
    
    if (updateError) {
      throw updateError;
    }
    
    // Password changed successfully
    res.json({ 
      success: true,
      message: 'Password changed successfully' 
    });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      error: 'Failed to change password',
      message: error.message 
    });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/reset-password', async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }

    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }    console.log(`Processing password reset request for email: ${email}`);
    
    // Check if the email exists in our database first
    const userExists = await prisma.users.findFirst({
      where: { email }
    });
    
    if (!userExists) {
      console.log(`User with email ${email} not found in database, but proceeding anyway for security`);
      // We still return success even if email doesn't exist (for security reasons)
      return res.json({ message: 'Password reset email sent' });
    }
    
    console.log(`User found in database, proceeding with password reset`);
    
    try {
      // Import our JWT-based password reset service
      const PasswordResetService = require('../shared/services/password-reset.service');
      // Generate a JWT token for this user
      const resetToken = PasswordResetService.generateResetToken(userExists);      // Use the email service factory to send the email
      const emailService = require('../shared/services/email-service-factory');
      await emailService.sendPasswordResetEmail(userExists, resetToken);
      console.log(`Password reset email sent to ${email} with JWT token`);
      
      return res.json({ message: 'Password reset email sent' });    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      return res.status(500).json({ 
        error: 'Failed to send password reset email',
        details: process.env.NODE_ENV === 'development' ? emailError.message : 'Please try again later'
      });
    }
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @route   POST /api/auth/update-password
 * @desc    Update password using JWT token or Supabase hash
 * @access  Public - No authentication required (stateless process using token verification)
 */
router.post('/update-password', async (req, res) => {
  try {
    // Log the request for debugging
    console.log('Password reset request received', {
      hasPassword: !!req.body.password,
      hasToken: !!req.body.token,
      tokenLength: req.body.token ? req.body.token.length : 0,
      hasHash: !!req.body.hash
    });
    
    if (!isConfigured) {
      return res.status(503).json({ 
        error: 'Authentication service not configured',
        details: 'Supabase credentials are missing'
      });
    }

    const { password, hash, token } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    // Handle JWT token, legacy token, or hash-based reset
    if (token) {
      console.log('Attempting password reset using token:', token ? `${token.substring(0, 20)}...` : 'null');
      try {        // First try our JWT-based verification
        const PasswordResetService = require('../shared/services/password-reset.service');
        const tokenData = PasswordResetService.verifyResetToken(token);
        
        if (tokenData) {
          console.log('JWT token verified successfully:', tokenData.userId);
          
          // Parse userId to int since it's stored as an integer in the database
          // but transmitted as a string in JWT tokens
          const userIdInt = parseInt(tokenData.userId, 10);
            console.log(`Looking for user with ID: ${userIdInt}`);
          
          // Get the user with this ID
          const user = await prisma.users.findUnique({
            where: { user_id: userIdInt }
          });
            // Log the found user for debugging
          console.log('Found user:', user ? `${user.email} (ID: ${user.user_id})` : 'No user found');
              if (!user) {
            console.error('User not found for ID:', userIdInt);
            return res.status(404).json({ 
              error: 'User not found',
              details: `No user found with ID ${userIdInt}`,
              tokenInfo: {
                userId: tokenData.userId,
                email: tokenData.email,
                tokenId: tokenData.tokenId
              }
            });
          }
            // Ensure user exists in our database
          if (!user) {
            console.error('User not found for ID:', userIdInt);
            return res.status(404).json({ 
              error: 'User not found',
              details: `No user found with ID ${userIdInt}`,
              tokenInfo: {
                userId: tokenData.userId,
                email: tokenData.email,
                tokenId: tokenData.tokenId
              }
            });
          }
          
          // Update the password using Supabase admin API
          console.log(`Updating password for user ${user.email}`);
          
          // Find the user in Supabase by email since we don't have auth_user_id in schema
          const { data: supabaseUsers, error: getUserError } = await adminClient.auth.admin.listUsers();
          
          if (getUserError) {
            console.error('Error fetching Supabase users:', getUserError);
            return res.status(500).json({ error: 'Failed to update password' });
          }
          
          // Find the user in Supabase by email
          const supabaseUserRecord = supabaseUsers.users.find(u => u.email === user.email);
          
          if (!supabaseUserRecord) {
            console.error('User not found in Supabase:', user.email);
            return res.status(404).json({ error: 'User authentication record not found' });
          }
          
          const { error: updateError } = await adminClient.auth.admin.updateUserById(
            supabaseUserRecord.id,
            { password }
          );
          
          if (updateError) {
            console.error('Supabase password update error:', updateError);
            throw updateError;
          }
          
          console.log(`Password updated successfully for user: ${tokenData.email}`);
          return res.json({ message: 'Password updated successfully' });
        } else if (token.startsWith('manual-reset-')) {
          // Legacy token format - for backward compatibility
          console.log('Falling back to legacy token format');
          // Find the user by email (would be better with a dedicated token table)
          let userEmail = null;
          
          if (req.session && req.session.email) {
            userEmail = req.session.email;
          } else if (req.body.email) {
            userEmail = req.body.email;
          }
            if (!userEmail) {
            return res.status(400).json({ error: 'Email is required for legacy token reset' });
          }
            // Get the user with this email
          const user = await prisma.users.findFirst({
            where: { email: userEmail }
          });
          
          if (!user) {
            return res.status(404).json({ error: 'User not found' });
          }
          
          // Update the password using Supabase admin API with email
          // Since we don't have auth_user_id in the schema, we'll use the email approach
          const { data: supabaseUser, error: getUserError } = await adminClient.auth.admin.listUsers();
          
          if (getUserError) {
            console.error('Error fetching Supabase users:', getUserError);
            return res.status(500).json({ error: 'Failed to update password' });
          }
          
          // Find the user in Supabase by email
          const supabaseUserRecord = supabaseUser.users.find(u => u.email === userEmail);
          
          if (!supabaseUserRecord) {
            console.error('User not found in Supabase:', userEmail);
            return res.status(404).json({ error: 'User authentication record not found' });
          }
          
          // Update the password using the Supabase user ID
          const { error: updateError } = await adminClient.auth.admin.updateUserById(
            supabaseUserRecord.id,
            { password }
          );
          
          if (updateError) {
            throw updateError;
          }
          
          console.log(`Password updated successfully for user: ${userEmail} (legacy token)`);
          return res.json({ message: 'Password updated successfully' });
        } else {
          return res.status(400).json({ error: 'Invalid token format' });
        }
      } catch (tokenError) {
        console.error('Token verification or password reset error:', tokenError);
        return res.status(400).json({ error: tokenError.message });
      }
    } else if (hash && hash.includes('type=recovery')) {
      // Original hash-based method
      console.log('Attempting password reset using hash');
      
      // Extract the access token from the hash
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get('access_token');
      
      if (!accessToken) {
        return res.status(400).json({ error: 'Invalid recovery link' });
      }
      
      try {
        // Verify the token
        const { data: userData, error: verifyError } = await adminClient.auth.getUser(accessToken);
        
        if (verifyError || !userData.user) {
          console.error('Token verification error:', verifyError);
          return res.status(401).json({ error: 'Invalid or expired recovery token' });
        }
        
        // Update the user's password
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          userData.user.id,
          { password }
        );
        
        if (updateError) {
          console.error('Password update error:', updateError);
          return res.status(400).json({ error: updateError.message });
        }
        
        console.log(`Password updated successfully for user: ${userData.user.email}`);
        return res.json({ message: 'Password updated successfully' });
      } catch (supabaseError) {
        console.error('Supabase error during password update:', supabaseError);
        return res.status(500).json({ error: 'Failed to update password' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid password reset request. Missing token or hash.' });
    }
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;