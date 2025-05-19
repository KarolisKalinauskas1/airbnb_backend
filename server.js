/**
 * Server startup file for the camping rental application backend
 */
const app = require('./src/app');

// Get port from environment variable or use default
const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API available at: http://localhost:${PORT}/api`);
});
