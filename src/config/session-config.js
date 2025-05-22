const session = require('express-session');

const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'super-secret-key-change-me-in-production',
  name: 'camping.sid', // Custom session ID cookie name
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiration on activity
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  }
};

// Configure CSRF protection
const csrfProtection = {
  cookie: {
    key: '_csrf',
    path: '/'
  },
  ignoreMethods: ['HEAD', 'OPTIONS', 'GET'],
  ignorePaths: ['/api/auth/oauth', '/api/webhook']
};

// Add production-specific settings
if (process.env.NODE_ENV === 'production') {
  sessionConfig.cookie.secure = true; // Require HTTPS in production
  sessionConfig.cookie.sameSite = 'strict'; // Stricter CSRF protection in production
  sessionConfig.proxy = true; // Trust the reverse proxy
}

module.exports = {
  sessionConfig,
  csrfProtection
};