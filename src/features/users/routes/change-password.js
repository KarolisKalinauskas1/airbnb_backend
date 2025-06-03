const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../../middlewares/auth');
const { adminClient } = require('../../../../config/supabase');

/**
 * @route   POST /api/users/change-password 
 * @desc    Change user password
 * @access  Private
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Both current password and new password are required'
      });
    }

    // Password safety validations
    if (!req.user || !req.user.email) {
      console.error('No user data in request:', req.user);
      return res.status(401).json({
        error: 'Authentication error',
        message: 'User session is invalid or expired'
      });
    }

    // Log the attempt for security monitoring
    console.log('Password change attempt for user:', {
      email: req.user.email,
      userId: req.user.user_id,
      timestamp: new Date().toISOString()
    });

    // Check if new password is different from current password first
    if (currentPassword === newPassword) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'New password must be different from your current password'
      });
    }

    // Password requirements
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'Invalid password',
        message: 'New password must be at least 8 characters long'
      });
    }

    // Verify the current password with Supabase
    const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
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

    // Update password in Supabase
    const { data: userData, error: updateError } = await adminClient.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      console.error('Failed to update password in Supabase:', updateError);
      
      if (updateError.status === 422 && updateError.code === 'same_password') {
        return res.status(400).json({
          error: 'Invalid password',
          message: 'New password must be different from your current password'
        });
      }

      if (updateError.status === 400) {
        return res.status(400).json({ 
          error: 'Invalid password',
          message: 'Password must meet the minimum requirements: at least 8 characters long and contain letters, numbers, or special characters.'
        });
      }

      throw updateError;
    }

    // Get the new session to maintain login state
    const { data: { session: newSession }, error: sessionError } = await adminClient.auth.getSession();
    
    if (sessionError) {
      console.error('Failed to get new session:', sessionError);
      throw sessionError;
    }

    if (!newSession) {
      console.error('No session returned after password update');
      return res.status(500).json({
        error: 'Server error',
        message: 'Password was updated but session refresh failed'
      });
    }

    console.log('Password successfully updated for user:', req.user.email);
    
    // Return success with new session data to maintain login state
    res.json({ 
      success: true, 
      message: 'Password successfully updated',
      session: newSession
    });

  } catch (error) {
    console.error('Error changing password:', error);
    
    if (error.message?.includes('same_password')) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'New password must be different from your current password'
      });
    }
    
    res.status(500).json({ 
      error: 'Server error',
      message: 'Failed to change password. Please try again later.'
    });
  }
});

module.exports = router;
