/**
 * Circuit breaker middleware for API routes
 * Prevents API abuse and cascading failures
 */

const clientTracker = new Map();

// Configuration
const MAX_REQUESTS_PER_MINUTE = 60;
const BREAKER_RESET_TIME_MS = 60000; // 1 minute
const BANNED_RESET_TIME_MS = 300000; // 5 minutes

function apiCircuitBreaker(req, res, next) {
  const clientIP = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  
  // Initialize or get client state
  if (!clientTracker.has(clientIP)) {
    clientTracker.set(clientIP, {
      requests: [],
      banned: false,
      banUntil: null,
      firstRequest: now
    });
  }
  
  const clientState = clientTracker.get(clientIP);
  
  // If client is banned, block the request
  if (clientState.banned) {
    if (now > clientState.banUntil) {
      // Ban period is over, reset state
      clientState.banned = false;
      clientState.requests = [now];
      clientState.firstRequest = now;
    } else {
      // Still banned, reject request
      return res.status(429).json({
        error: 'Too many requests. Your access has been temporarily blocked.',
        retryAfter: Math.ceil((clientState.banUntil - now) / 1000)
      });
    }
  }
  
  // Clean up old requests more than a minute old
  clientState.requests = clientState.requests.filter(time => now - time < BREAKER_RESET_TIME_MS);
  
  // Add this request
  clientState.requests.push(now);
  
  // Check if rate limit is exceeded
  if (clientState.requests.length > MAX_REQUESTS_PER_MINUTE) {
    // Apply ban
    clientState.banned = true;
    clientState.banUntil = now + BANNED_RESET_TIME_MS;
    
    console.warn(`Client ${clientIP} banned for exceeding rate limit with ${clientState.requests.length} requests in the last minute`);
    
    return res.status(429).json({
      error: 'Rate limit exceeded. Your access has been temporarily blocked.',
      retryAfter: Math.ceil(BANNED_RESET_TIME_MS / 1000)
    });
  }
  
  next();
}

module.exports = apiCircuitBreaker;
