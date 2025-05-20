// Configure null logger for production
const logger = {
  error: () => {}, // No-op for production
  info: () => {},
  debug: () => {},
  warn: () => {}
};

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    this.statusCode = 400;
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

/**
 * Error handling middleware
 */
function errorHandler(err, req, res, next) {
  // Silent error handling for production
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error'
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  if (err.name === 'NotFoundError') {
    return res.status(404).json({
      error: 'Not Found'
    });
  }
  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'Forbidden'
    });
  }

  if (err.name === 'ConflictError') {
    return res.status(409).json({
      error: 'Conflict'
    });
  }

  // Handle Prisma errors
  if (err.code?.startsWith('P')) {
    return res.status(400).json({
      error: 'Database Error'
    });
  }

  // Default error response
  res.status(err.statusCode || 500).json({
    error: 'Internal Server Error'
  });
}

module.exports = {
  errorHandler,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  ConflictError
}; 