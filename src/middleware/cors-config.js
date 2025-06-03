// Simplified and resilient CORS middleware
const corsMiddleware = (req, res, next) => {
    try {
        const origin = req.headers.origin || '*';
        
        // Log incoming request for debugging
        console.log('CORS middleware:', {
            path: req.path,
            method: req.method,
            origin: origin,
            headers: {
                ...req.headers,
                authorization: req.headers.authorization ? 'present' : 'absent'
            }
        });

        // Handle preflight requests immediately
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
            res.header('Access-Control-Max-Age', '86400'); // 24 hours
            return res.status(204).end();
        }

        // Helper function to check if route is public
        const isPublicRoute = (path, headers) => {
            // Check header first
            if (headers['x-public-route'] === 'true') {
                return true;
            }
            
            // Normalize the path
            const normalizedPath = path.toLowerCase();
            const publicPaths = [
                '/amenities', 
                '/countries', 
                '/camping-spots/amenities', 
                '/camping-spots/countries',
                '/api/amenities',
                '/api/countries',
                '/api/camping-spots/amenities',
                '/api/camping-spots/countries',
                '/health',
                '/api/health', 
                '/status',
                '/api/status', 
                '/auth',
                '/api/auth'
            ];

            // Check direct matches and path endings
            return publicPaths.some(p => {
                const cleanPath = normalizedPath.replace(/^\/api\//, '');
                const cleanPublicPath = p.replace(/^\/api\//, '');
                return cleanPath === cleanPublicPath || cleanPath.endsWith(cleanPublicPath);
            });
        };

        // Always handle OPTIONS requests for CORS
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
            res.header('Access-Control-Max-Age', '86400'); // 24 hours
            return res.status(204).end();
        }

        // For public routes or development environment
        if (process.env.NODE_ENV === 'development' || isPublicRoute(req.path, req.headers)) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
            if (isPublicRoute(req.path, req.headers)) {
                res.header('Cache-Control', 'public, max-age=300');
            }
            return next();
        }

        // For authenticated routes
        if (origin && origin !== 'null') {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        }

        next();
    } catch (error) {
        console.error('CORS middleware error:', error);
        next(error);
    }
};

module.exports = corsMiddleware;
