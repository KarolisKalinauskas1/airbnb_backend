/**
 * API Endpoint Configuration
 * Defines all API endpoints to ensure consistent handling
 */
const apiEndpoints = {
  // Route prefixes that should be treated as API endpoints
  prefixes: [
    '/api/',
    '/camping-spots',
    '/users',
    '/dashboard',
    '/bookings'
  ],
  
  // Check if a path is an API endpoint
  isApiPath: function(path) {
    return this.prefixes.some(prefix => path.startsWith(prefix));
  },
  
  // Check if a request is an API request (based on path or headers)
  isApiRequest: function(req) {
    return this.isApiPath(req.path) || 
           (req.headers.accept && req.headers.accept.includes('application/json'));
  }
};

module.exports = apiEndpoints;
