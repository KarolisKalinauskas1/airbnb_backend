// Define custom error classes
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.status = 400;
    }
}

class AuthenticationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthenticationError';
        this.status = 401;
    }
}

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error occurred:', {
        name: err.name,
        message: err.message,
        path: req.path,
        method: req.method,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Handle specific error types
    if (err instanceof ValidationError) {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
            details: err.details
        });
    }

    if (err instanceof AuthenticationError) {
        return res.status(401).json({
            error: 'Authentication Error',
            message: err.message
        });
    }

    // Handle Prisma errors
    if (err.name === 'PrismaClientKnownRequestError') {
        return res.status(400).json({
            error: 'Database Error',
            message: 'Invalid data provided',
            code: err.code
        });
    }

    if (err.name === 'PrismaClientValidationError') {
        return res.status(400).json({
            error: 'Database Validation Error',
            message: 'Invalid data format'
        });
    }

    // Default error response
    const statusCode = err.status || 500;
    const errorResponse = {
        error: err.name || 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    };

    res.status(statusCode).json(errorResponse);
};

module.exports = {
    errorHandler,
    ValidationError,
    AuthenticationError
};
