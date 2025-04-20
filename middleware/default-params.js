/**
 * Middleware to apply default parameters to specific routes
 * This helps ensure backward compatibility with clients that don't provide all required params
 */
function defaultParamsMiddleware(req, res, next) {
  // Only apply to GET requests
  if (req.method !== 'GET') {
    return next();
  }
  
  // Apply defaults for camping-spots endpoint
  if (req.path === '/camping-spots' || req.path === '/api/camping-spots') {
    // If start and end dates are missing, add defaults
    if (!req.query.startDate || !req.query.endDate) {
      const today = new Date();
      const nextMonth = new Date();
      nextMonth.setDate(today.getDate() + 30);
      
      // Format dates as YYYY-MM-DD
      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      // Apply defaults if not provided
      if (!req.query.startDate) {
        req.query.startDate = formatDate(today);
        console.log('Applied default startDate:', req.query.startDate);
      }
      
      if (!req.query.endDate) {
        req.query.endDate = formatDate(nextMonth);
        console.log('Applied default endDate:', req.query.endDate);
      }
    }
  }
  
  next();
}

module.exports = defaultParamsMiddleware;
