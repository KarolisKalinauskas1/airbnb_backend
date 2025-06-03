/**
 * Utility functions for owner status checks
 */

/**
 * Normalize owner status check across the application
 * @param {*} isowner - The owner status value to check
 * @returns {boolean} - Whether the user is an owner
 */
function normalizeOwnerStatus(isowner) {
  if (isowner === undefined || isowner === null) return false;
  
  // Handle all possible truthy values
  if (typeof isowner === 'string') {
    const normalizedStr = isowner.toLowerCase();
    return ['1', 'true', 'yes'].includes(normalizedStr);
  }
  
  // Handle numeric and boolean values
  return isowner === 1 || isowner === true;
}

module.exports = {
  normalizeOwnerStatus
};
