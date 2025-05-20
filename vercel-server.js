// Vercel serverless entry point
require("dotenv").config();

// Simple error handlers
process.on("uncaughtException", (error) => console.error("UNCAUGHT:", error));
process.on("unhandledRejection", (reason) => console.error("REJECTION:", reason));

// Export the app
const app = require("./src/app");
module.exports = app;
