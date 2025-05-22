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
    '/api/auth/update-password',
    '/api/auth/refresh-token',
    '/api/auth/status',
    '/api/auth/session',
    '/api/auth/restore-session',
    '/api/auth/verify-token',
    '/api/auth/sync-session',
    '/api/auth/logout',
    '/api/auth/signout',

    // Public camping spot endpoints
    '/api/camping-spots',
    '/api/camping-spots/search',
    '/api/camping-spots/featured',
    '/api/camping-spots/popular',
    
    // Public amenities endpoints
    '/api/amenities',
    '/api/camping-spots/amenities',
    '/api/camping-spots/countries',
    
    // Health check endpoints
    '/api/health',
    '/api/status'
];

const publicPatterns = [
    // Auth routes with dynamic parameters
    /^\/?(api\/)?auth\/(register|login|signin|signup|reset\-password|update\-password|refresh\-token)(\?.*)?$/,
    /^\/?(api\/)?auth\/oauth\/google\/(login|callback|supabase-callback)(\?.*)?$/,
    /^\/social-auth-success(\?.*)?$/,
    
    // Camping spot details with IDs
    /^\/?(api\/)?camping-spots\/\d+$/,
    /^\/?(api\/)?camping-spots\/\d+\/reviews$/,
    
    // Search with parameters
    /^\/?(api\/)?camping-spots\/search\?/,
    /^\/?(api\/)?camping-spots\/filter\?/
];

module.exports = {
    publicRoutes,
    publicPatterns,
    
    /**
     * Check if a route is public
     * @param {string} path - The route path to check
     * @param {string} method - The HTTP method (GET, POST, etc)
     * @returns {boolean}
     */
    isPublicRoute: (path, method) => {
        // Always allow OPTIONS requests (CORS)
        if (method === 'OPTIONS') {
            return true;
        }

        // Normalize path
        const normalizedPath = path.toLowerCase();

        // Check exact matches
        if (publicRoutes.includes(normalizedPath)) {
            return true;
        }

        // Check patterns
        if (publicPatterns.some(pattern => pattern.test(normalizedPath))) {
            return true;
        }

        // Special case: GET requests to camping spots are public
        if (method === 'GET' && normalizedPath.startsWith('/api/camping-spots')) {
            return true;
        }

        return false;
    }
};
