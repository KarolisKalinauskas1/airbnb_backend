const errorRecoveryMiddleware = (err, req, res, next) => {
    console.error('Error caught by recovery middleware:', {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });

    // For syntax errors that crash the server
    if (err instanceof SyntaxError) {
        return res.status(400).json({
            status: 'error',
            type: 'SyntaxError',
            message: 'Invalid request syntax'
        });
    }

    // For CORS errors
    if (err.message.includes('CORS')) {
        return res.status(403).json({
            status: 'error',
            type: 'CORSError',
            message: err.message
        });
    }

    // Generic error response
    res.status(err.status || 500).json({
        status: 'error',
        message: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred' 
            : err.message
    });
};

module.exports = errorRecoveryMiddleware;
