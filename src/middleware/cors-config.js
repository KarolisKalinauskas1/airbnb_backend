// Simplified and resilient CORS middleware
const corsMiddleware = (req, res, next) => {
    try {
        const origin = req.headers.origin;
        const allowedOrigins = [
            process.env.FRONTEND_URL,
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:5174',
            'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
            'https://airbnb-frontend-gamma.vercel.app'
        ].filter(Boolean); // Remove any undefined/null values

        // Function to check if origin matches Vercel deployment pattern
        const isVercelDeployment = (origin) => {
            return origin && (
                /^https:\/\/airbnb-frontend[a-zA-Z0-9-.]+-karoliskalinauskas1s-projects\.vercel\.app$/.test(origin) ||
                /^https:\/\/airbnb-frontend[a-zA-Z0-9.-]+\.vercel\.app$/.test(origin)
            );
        };

        // Allow all in development
        if (process.env.NODE_ENV === 'development') {
            res.header('Access-Control-Allow-Origin', origin || '*');
        }
        // Production checks
        else if (origin && (allowedOrigins.includes(origin) || isVercelDeployment(origin))) {
            res.header('Access-Control-Allow-Origin', origin);
        }
        // Default deny
        else if (origin) {
            console.warn(`CORS: Denied request from origin: ${origin}`);
            return res.status(403).json({
                error: 'CORS Error',
                message: 'Origin not allowed'
            });
        }

        // Standard CORS headers
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 
            'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Max-Age', '86400'); // 24 hours

        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }

        next();
    } catch (error) {
        console.error('CORS middleware error:', error);
        // Don't fail on CORS errors, just log and continue
        next();
    }
};

module.exports = corsMiddleware;
