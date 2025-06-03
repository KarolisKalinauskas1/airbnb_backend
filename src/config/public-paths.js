/**
 * Configuration for public routes that don't require authentication
 */
const publicPaths = [
    // Auth endpoints
    '/api/auth/signin',
    '/api/auth/signup',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/reset-password',
    '/api/auth/update-password',
    '/api/auth/refresh-token',
    '/api/auth/status',
    
    // Public amenities and countries endpoints - all variations with exact paths
    '/api/amenities',
    '/api/countries',
    '/api/camping-spots/amenities',
    '/api/camping-spots/countries',
    '/camping-spots/amenities',
    '/camping-spots/countries',
    '/amenities',
    '/countries',
    
    // Other public endpoints
    '/api/health',
    '/api/status',
    '/health',
    '/status'
];

const publicPatterns = [
    // Auth routes with dynamic parameters
    /^\/?(api\/)?auth\/(register|login|signin|signup|reset\-password|update\-password|refresh\-token)(\?.*)?$/,
    
    // Public routes with exact pattern matches
    /^\/?(api\/)?((camping-spots\/)?(amenities|countries))$/,
    /^\/?(api\/)?(health|status)$/
];

/**
 * Check if a route is public
 * @param {string} path - The route path to check
 * @param {string} method - The HTTP method (GET, POST, etc)
 * @returns {boolean}
 */
const isPublicRoute = (path, method = 'GET') => {
    // Always allow OPTIONS requests for CORS
    if (method === 'OPTIONS') {
        return true;
    }

    // Normalize path by removing leading/trailing slashes and converting to lowercase
    const normalizedPath = path.toLowerCase().replace(/^\/+|\/+$/g, '');

    // Check exact matches first
    if (publicPaths.some(p => normalizedPath.startsWith(p.toLowerCase()))) {
        return true;
    }

    // Then check patterns
    return publicPatterns.some(pattern => pattern.test(normalizedPath));
};

module.exports = { publicPaths, publicPatterns, isPublicRoute };
