const cors = require('cors');

const corsConfig = cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) {
            return callback(null, true);
        }

        // List of allowed origins
        const allowedOrigins = [
            process.env.FRONTEND_URL,
            'http://localhost:3000',
            'http://localhost:5173',
            // Add your production URLs here
            'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
            'https://airbnb-frontend-gamma.vercel.app',
            'https://*.vercel.app'
        ].filter(Boolean);

        // Check if origin is allowed
        if (process.env.NODE_ENV === 'development') {
            callback(null, true); // Allow all origins in development
        } else if (allowedOrigins.some(allowed => origin.match(new RegExp(allowed.replace('*', '.*'))))) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'X-CSRF-Token'
    ],
    exposedHeaders: ['X-New-Token'], // For token refresh
    credentials: true,
    maxAge: 86400, // 24 hours in seconds
    preflightContinue: false,
    optionsSuccessStatus: 204
});

module.exports = corsConfig;
