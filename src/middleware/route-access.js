const { authenticate, optionalAuthenticate } = require('./auth');
const { isPublicRoute } = require('../config/public-paths');

// Middleware to check if a route should be public or protected
const routeAccessMiddleware = (req, res, next) => {
    try {
        const path = req.path;
        const method = req.method;

        // Always allow OPTIONS requests for CORS
        if (method === 'OPTIONS') {
            const origin = req.headers.origin || '*';
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
            res.header('Access-Control-Max-Age', '86400'); // 24 hours
            return res.status(204).end();
        }

        // Special handling for public endpoints
        const publicPaths = [
            '/amenities',
            '/countries',
            '/camping-spots/amenities',
            '/camping-spots/countries',
            '/api/amenities',
            '/api/countries',
            '/api/camping-spots/amenities',
            '/api/camping-spots/countries'
        ];

        const normalizedPath = path.toLowerCase();
        const isPublicEndpoint = publicPaths.some(p => normalizedPath === p || normalizedPath.endsWith(p));

        if (isPublicEndpoint || req.headers['x-public-route'] === 'true') {
            // Add CORS headers for public endpoints
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            res.header('Cache-Control', 'public, max-age=300');
            return next();
        }

        // For all other routes, require authentication
        return authenticate(req, res, next);
    } catch (error) {
        console.error('Route access middleware error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = routeAccessMiddleware;