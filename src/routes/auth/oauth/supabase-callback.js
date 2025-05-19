/**
 * Supabase OAuth Callback Handler
 * 
 * This file handles processing user data after a successful Supabase OAuth login.
 * It creates or updates our user record and provides our own JWT token.
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateToken } = require('../../../../utils/jwt-helper');
const { adminClient } = require('../../../../config/supabase');

// Import email service for welcome emails
const SimpleGmailService = require('../../../shared/services/simple-gmail.service');

/**
 * Process Supabase OAuth callback data
 */
router.post('/google/supabase-callback', async (req, res) => {
  try {
    const { supabase_id, email, full_name, avatar_url } = req.body;
    
    if (!supabase_id || !email) {
      return res.status(400).json({ 
        error: 'Missing required data', 
        details: 'User ID and email are required' 
      });
    }

    console.log(`Processing Supabase OAuth data for: ${email}`);
    
    // Check if user exists in our database
    let user = await prisma.public_users.findFirst({
      where: { email: email }
    });

    let isNewUser = false;

    // If user doesn't exist in our database, create them
    if (!user) {
      console.log(`New user via Supabase OAuth: ${email}`);
      isNewUser = true;
      
      user = await prisma.public_users.create({
        data: {
          email,
          full_name: full_name || email.split('@')[0],
          auth_user_id: supabase_id,
          profile_image: avatar_url || null,
          isowner: '0',
          verified: 'yes',
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      // Send welcome email for new users
      if (isNewUser) {
        SimpleGmailService.sendWelcomeEmail(user)
          .catch(err => console.error('Failed to send welcome email:', err));
      }
    } 
    // If user exists but we have updated information (like profile picture)
    else if (avatar_url && !user.profile_image) {
      await prisma.public_users.update({
        where: { user_id: user.user_id },
        data: { 
          profile_image: avatar_url,
          updated_at: new Date()
        }
      });
      user.profile_image = avatar_url;
    }

    // Generate JWT token for our API
    const token = generateToken(user, { expiresIn: '7d' });
    
    console.log(`Supabase OAuth successful for ${email}, returning user data and token`);
    
    // Return user data and token
    res.json({
      user,
      token
    });
    
  } catch (error) {
    console.error('Error in Supabase OAuth callback:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process authentication',
      details: error.message
    });
  }
});

module.exports = router;
