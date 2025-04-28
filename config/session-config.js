/**
 * Session configuration for express-session
 */
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Configure session options
const sessionConfig = {
  name: 'camping.sid', // Unique name for the session cookie
  secret: process.env.SESSION_SECRET || 'camping-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: ONE_WEEK, // Set to 1 week for persistence
    httpOnly: true, // Prevents JavaScript access to the cookie
    secure: isProduction, // Only use HTTPS in production
    sameSite: 'lax', // Protects against CSRF while allowing normal navigation
    domain: process.env.COOKIE_DOMAIN || 'localhost' // Set domain based on environment
  }
};

module.exports = sessionConfig;
