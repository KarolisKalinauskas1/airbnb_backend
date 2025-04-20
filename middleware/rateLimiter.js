/**
 * Simple in-memory rate limiter middleware
 */

// Store request counts by IP
const requestCounts = {};

// Default settings - increased to prevent excessive rate limiting
const RATE_WINDOW_MS = 60000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 300; // Increased from 30 to 300 requests per minute

/**
 * Rate limiter middleware
 * Limits requests based on client IP address to prevent abuse
 */
function rateLimiter(req, res, next) {
  // Skip rate limiting for health checks and non-production environments
  if (req.path.includes('/health') || process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Get client IP (handle proxies)
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  
  // Clean up old entries
  for (const key in requestCounts) {
    if (now - requestCounts[key].timestamp > RATE_WINDOW_MS) {
      delete requestCounts[key];
    }
  }
  
  // Initialize or increment counter
  if (!requestCounts[ip]) {
    requestCounts[ip] = { count: 1, timestamp: now };
  } else {
    requestCounts[ip].count++;
  }
  
  // Check if rate limit exceeded
  if (requestCounts[ip].count > MAX_REQUESTS_PER_WINDOW) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((requestCounts[ip].timestamp + RATE_WINDOW_MS - now) / 1000)
    });
  }
  
  next();
}

module.exports = rateLimiter;
