/**
 * Configuration for public routes that don't require authentication
 */

const publicRoutes = [
    // Auth endpoints
    '/api/auth/signin',
    '/api/auth/signup',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/reset-password',
    '/api/auth/refresh-token',
    
    // Health check endpoints
    '/api/health',
    '/health',
    '/status',
    
    // Public amenities and countries endpoints - all variations
    '/api/amenities',
    '/api/countries',
    '/api/camping-spots/amenities',
    '/api/camping-spots/countries',
    '/camping-spots/amenities',
    '/camping-spots/countries',
    '/amenities',
    '/countries'
];

const publicPatterns = [
    // Auth routes with dynamic parameters
    /^\/?(api\/)?auth\/(register|login|signin|signup|reset\-password|refresh\-token)(\?.*)?$/i,
    
    // Amenities and countries endpoints with optional /api/ prefix
    /^\/?(api\/)?(amenities|countries)(\?.*)?$/i,
    /^\/?(api\/)?(camping-spots\/)(amenities|countries)(\?.*)?$/i,
    
    // Health and status endpoints with optional /api/ prefix
    /^\/?(api\/)?(health|status)(\?.*)?$/i
];

/**
 * Check if a route is public
 * @param {string} path - The route path to check
 * @returns {boolean}
 */
const isPublicRoute = (path) => {
    // Normalize path by removing leading/trailing slashes and optional /api/ prefix
    const normalizedPath = path.toLowerCase()
        .replace(/^\/+|\/+$/g, '')  // Remove leading/trailing slashes
        .replace(/^api\//, '');      // Remove api/ prefix if present
    
    // Check exact matches first
    if (publicRoutes.some(route => route.toLowerCase().replace(/^\/+|\/+$/g, '').replace(/^api\//, '') === normalizedPath)) {
        return true;
    }

    // Then check pattern matches
    return publicPatterns.some(pattern => pattern.test(path));
};

module.exports = {
    publicRoutes,
    publicPatterns,
    isPublicRoute
};
