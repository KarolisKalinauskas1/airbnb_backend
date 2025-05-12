const EmailService = require('../../shared/services/email.service');

router.post('/register', validate(registerUserSchema), async (req, res, next) => {
  try {
    // ... existing registration code ...

    // After successful user creation
    try {
      await EmailService.sendWelcomeEmail(user.email, user.full_name);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the registration if email fails
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner) || 0
      },
      session: req.session ? {
        userId: user.user_id,
        email: user.email,
        authenticated: true
      } : undefined
    });
  } catch (error) {
    // ... existing error handling ...
  }
}); 