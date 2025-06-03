// Enhanced CORS middleware with better public route handling
const corsMiddleware = (req, res, next) => {
    const origin = req.headers.origin || '*';
    
    // Helper function to check if a path is a public route
    const isPublicRoute = (path) => {
        const normalizedPath = path.toLowerCase();
        return (
            normalizedPath.includes('/camping-spots/amenities') || 
            normalizedPath.includes('/camping-spots/countries') ||
            normalizedPath.includes('/api/camping-spots/amenities') || 
            normalizedPath.includes('/api/camping-spots/countries') ||
            normalizedPath.includes('/amenities') ||
            normalizedPath.includes('/countries') ||
            normalizedPath.includes('/api/amenities') ||
            normalizedPath.includes('/api/countries')
        );
    };

    // Function to check if origin matches Vercel deployment pattern
    const isVercelDeployment = (origin) => {
        return origin && (
            /^https:\/\/airbnb-frontend[a-zA-Z0-9-.]+-karoliskalinauskas1s-projects\.vercel\.app$/.test(origin) ||
            /^https:\/\/airbnb-frontend[a-zA-Z0-9.-]+\.vercel\.app$/.test(origin)
        );
    };

    // List of allowed origins
    const allowedOrigins = [
        process.env.FRONTEND_URL,
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
        'https://airbnb-frontend-gamma.vercel.app'
    ].filter(Boolean);

    // Always handle OPTIONS requests first
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
        return res.status(204).end();
    }

    // In development mode or for public routes, be permissive
    if (process.env.NODE_ENV === 'development' || isPublicRoute(req.path)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
        return next();
    }

    // For production, check against allowed origins
    if (origin && (allowedOrigins.includes(origin) || isVercelDeployment(origin))) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Public-Route');
        next();
    } else {
        console.warn(`CORS: Denied request from origin: ${origin}, path: ${req.path}`);
        res.status(403).json({
            error: 'CORS Error',
            message: 'Origin not allowed'
        });
    }
};

module.exports = corsMiddleware;
