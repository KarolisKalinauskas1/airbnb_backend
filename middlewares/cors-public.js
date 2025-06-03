/**
 * CORS middleware for public endpoints
 */

const PUBLIC_PATHS = [
    '/api/amenities',
    '/api/countries',
    '/api/camping-spots/amenities',
    '/api/camping-spots/countries',
    '/amenities',
    '/countries',
    '/camping-spots/amenities',
    '/camping-spots/countries',
    '/health',
    '/status',
    '/api/health',
    '/api/status'
];

/**
 * Express middleware function for handling CORS
 */
module.exports = function(req, res, next) {
    const path = req.path.toLowerCase().replace(/^\/+|\/+$/g, '');
    
    // Check if path is public
    const isPublic = PUBLIC_PATHS.some(publicPath => {
        const cleanPath = path.replace(/^api\//, '');
        const cleanPublicPath = publicPath.replace(/^\/?(api\/)?/, '');
        return cleanPath === cleanPublicPath || cleanPath.startsWith(cleanPublicPath + '/');
    });

    if (isPublic || req.headers['x-public-route'] === 'true') {
        // Set CORS headers for public endpoints
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
        res.header('Cache-Control', 'public, max-age=300');

        // Handle OPTIONS requests
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Max-Age', '86400');
            return res.status(204).end();
        }
    }

    next();
};
