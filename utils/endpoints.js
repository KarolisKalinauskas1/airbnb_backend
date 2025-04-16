/**
 * Endpoint utilities to standardize API endpoint detection across the application
 */

// List of API endpoint prefixes
const API_PREFIXES = [
  '/api/',
  '/camping-spots',
  '/users',
  '/dashboard',
  '/bookings'
];

/**
 * Check if a path is an API endpoint
 * @param {string} path - The path to check
 * @returns {boolean} - True if the path is an API endpoint
 */
function isApiPath(path) {
  return API_PREFIXES.some(prefix => path.startsWith(prefix));
}

/**
 * Check if a request is an API request (by path or accept header)
 * @param {Object} req - Express request object
 * @returns {boolean} - True if the request is an API request
 */
function isApiRequest(req) {
  return isApiPath(req.path) || 
         (req.headers.accept && req.headers.accept.includes('application/json'));
}

module.exports = {
  API_PREFIXES,
  isApiPath,
  isApiRequest
};
