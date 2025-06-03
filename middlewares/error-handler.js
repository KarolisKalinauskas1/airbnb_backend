// Custom error classes
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.status = 400;
    }
}

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
        this.status = 404;
    }
}

class ForbiddenError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ForbiddenError';
        this.status = 403;
    }
}

class RegistrationError extends Error {
    constructor(message, details = null) {
        super(message);
        this.name = 'RegistrationError';
        this.status = 400;
        this.details = details;
    }
}

// Error handler middleware
function errorHandler(err, req, res, next) {
    console.error('Error occurred:', {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Handle CORS errors
    if (err.message.includes('CORS')) {
        return res.status(403).json({
            error: 'CORS Error',
            message: 'Request blocked by CORS policy'
        });
    }

    // Handle Prisma errors
    if (err.code && err.code.startsWith('P2')) {
        switch (err.code) {
            case 'P2002':
                return res.status(409).json({
                    error: 'Database Conflict',
                    message: 'A record with this value already exists',
                    details: err.meta
                });
            case 'P2025':
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Record not found',
                    details: err.meta
                });
            default:
                return res.status(500).json({
                    error: 'Database Error',
                    message: 'An unexpected database error occurred'
                });
        }
    }

    // Handle custom errors
    if (err instanceof ValidationError || err instanceof NotFoundError || 
        err instanceof ForbiddenError || err instanceof RegistrationError) {
        return res.status(err.status).json({
            error: err.name,
            message: err.message,
            details: err.details
        });
    }

    // Handle other errors
    const status = err.status || 500;
    const response = {
        error: err.name || 'Internal Server Error',
        message: err.message || 'An unexpected error occurred'
    };

    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    res.status(status).json(response);
}

module.exports = {
    errorHandler,
    ValidationError,
    NotFoundError,
    ForbiddenError,
    RegistrationError
};
