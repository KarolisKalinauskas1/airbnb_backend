const path = require('path');
const { spawn } = require('child_process');

// Ensure we're in the right directory
process.chdir(path.join(__dirname, '..'));

// Start the deploy script
require('../deploy.js');
