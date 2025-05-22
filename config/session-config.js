/**
 * Session configuration for express-session
 */
const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Determine if we're in production
 */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Configure session options with enhanced security
 */
const sessionConfig = {
  name: 'camping.sid', // Unique name for the session cookie
  secret: process.env.SESSION_SECRET || 'camping-session-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Refresh session with each request
  cookie: {
    maxAge: ONE_WEEK,
    httpOnly: true, // Prevents JavaScript access to the cookie
    secure: isProduction, // Only use HTTPS in production
    sameSite: isProduction ? 'strict' : 'lax', // Stronger CSRF protection in production
    domain: process.env.COOKIE_DOMAIN || undefined, // Set domain based on environment
  },
  // Additional security options
  name: `camping-${process.env.NODE_ENV}`, // Namespace cookies by environment
  proxy: isProduction, // Trust the reverse proxy when setting secure cookies behind HTTPS
};

// Add additional production hardening
if (isProduction) {
  sessionConfig.cookie.secure = true; // Force HTTPS only
  sessionConfig.cookie.sameSite = 'strict'; // Strict CSRF protection
  
  // Validate session secret is set
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('Session secret must be at least 32 characters in production');
  }
}

module.exports = sessionConfig;
