/**
 * Google OAuth Authentication Routes
 * 
 * This file handles Google OAuth authentication routes.
 */

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { generateToken } = require('../../../utils/jwt-helper');
const { adminClient, isConfigured } = require('../../../config/supabase');

// Import email service
const SimpleGmailService = require('../../shared/services/simple-gmail.service');

// Google OAuth client setup
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/oauth/google/callback';

const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

/**
 * Generate auth URL for Google login
 */
router.get('/login', (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(503).json({ 
        error: 'Google OAuth not configured', 
        details: 'Missing client credentials'
      });
    }

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      prompt: 'consent' // Force to get refresh token
    });

    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

/**
 * Google OAuth callback handler
 */
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=missing_code`);
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Verify ID token and get user info
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    console.log(`Google login: ${email}`);

    // Check if user already exists in Supabase
    const { data: existingAuthUser, error: authError } = await adminClient.auth.admin.listUsers({
      filter: {
        email: email
      }
    });

    let authUserId;
    let isNewUser = false;

    // If user doesn't exist in Supabase, create them
    if (!existingAuthUser?.users?.length) {
      // Generate a random password for Supabase (user won't need to know it)
      const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase();
      
      // Create user in Supabase
      const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: name, google_id: googleId }
      });

      if (createError) {
        console.error('Error creating Supabase user:', createError);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=auth_error`);
      }

      authUserId = newAuthUser.user.id;
      isNewUser = true;
    } else {
      authUserId = existingAuthUser.users[0].id;
    }

    // Check if user exists in our database
    let user = await prisma.public_users.findFirst({
      where: { email: email }
    });

    // If user doesn't exist in our database, create them
    if (!user) {
      user = await prisma.public_users.create({
        data: {
          email,
          full_name: name || email.split('@')[0],
          auth_user_id: authUserId,
          profile_image: picture || null,
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
    else if (picture && !user.profile_image) {
      await prisma.public_users.update({
        where: { user_id: user.user_id },
        data: { 
          profile_image: picture,
          updated_at: new Date()
        }
      });
      user.profile_image = picture;
    }

    // Generate JWT token
    const token = generateToken(user, { expiresIn: '7d' });

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/social-auth-success?token=${token}&userId=${user.user_id}&email=${encodeURIComponent(email)}`);
    
  } catch (error) {
    console.error('Error in Google callback:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=auth_failed`);
  }
});

module.exports = router;
