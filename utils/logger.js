/**
 * Simple helper to provide consistent debug logging
 */
function debug(prefix, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${prefix}]`, ...args);
}

/**
 * Enhanced error logging
 */
function errorWithContext(prefix, error, context = {}) {
  const timestamp = new Date().toISOString();
  console.error(
    `[${timestamp}] [ERROR] [${prefix}]`,
    error.message,
    '\nStack:', error.stack,
    '\nContext:', context
  );
}

module.exports = {
  debug,
  errorWithContext
};
