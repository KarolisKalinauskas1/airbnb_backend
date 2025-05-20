/**
 * Production-safe debug logger (no-op)
 */
function debug(prefix, ...args) {
  // No logging in production
}

/**
 * Production-safe error logger (no-op)
 */
function errorWithContext(prefix, error, context = {}) {
  // No logging in production
}

module.exports = {
  debug,
  errorWithContext
};
