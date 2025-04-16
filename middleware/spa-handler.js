const path = require('path');

/**
 * SPA Handler middleware
 * Redirects non-API requests to the SPA frontend for client-side routing
 */
function spaHandler(req, res, next) {
  // Add debug logging
  console.log(`[SPA Handler] Path: ${req.path}, Accept: ${req.headers.accept}`);
  
  // Check if this is a dashboard route - should be handled by frontend
  const isDashboardRoute = req.path.startsWith('/dashboard/') || req.path === '/dashboard';
  
  // NEVER redirect API requests or JSON requests - this is critical
  if (req.path.startsWith('/api/') || 
      (req.headers.accept && req.headers.accept.includes('application/json') && !isDashboardRoute)) {
    console.log(`[SPA Handler] API/JSON request detected, bypassing for: ${req.path}`);
    return next();
  }

  // Check if the request is for a static file
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    console.log(`[SPA Handler] Static file request detected: ${req.path}`);
    return next();
  }

  // Special handling for dashboard routes - these should always be handled by the SPA
  if (isDashboardRoute) {
    console.log(`[SPA Handler] Dashboard route detected: ${req.path}`);
    // For HTML requests in development, redirect to frontend
    if (process.env.NODE_ENV === 'development') {
      console.log(`[SPA Handler] Development mode, serving frontend index.html for dashboard route`);
      return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
    // In production, serve the index.html
    console.log(`[SPA Handler] Production mode, serving index.html for dashboard route`);
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }

  console.log(`[SPA Handler] SPA route detected, handling: ${req.path}`);
  
  // For HTML requests in development, redirect to frontend
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SPA Handler] Development mode, redirecting to: ${process.env.FRONTEND_URL || 'http://localhost:5173'}${req.path}`);
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}${req.path}`);
  }
  
  // In production, serve the index.html
  console.log(`[SPA Handler] Production mode, serving index.html for: ${req.path}`);
  return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
}

module.exports = spaHandler;
