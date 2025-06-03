const cors = require('cors');

const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5173',  // Vite dev server
            'http://localhost:3000',  // Local backend
            'http://localhost:4173',  // Vite preview
            'https://airbnb-frontend-i8p5.vercel.app',  // Production frontend
            // Add other allowed origins as needed
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,  // Allow credentials (cookies, authorization headers)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'X-CSRF-Token',
        'x-public-route'
    ],
    exposedHeaders: ['X-New-Token'],  // Expose custom headers if needed
    maxAge: 600  // Cache preflight requests for 10 minutes
};

module.exports = cors(corsOptions);
