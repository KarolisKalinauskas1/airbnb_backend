#!/usr/bin/env node
/**
 * Setup Local Database Fallback
 * This script helps create a local database configuration as a fallback
 * when connections to remote Supabase are not possible
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Prompt user for input
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Check if a command is available
function commandExists(command) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Create .env.local with offline mode settings
function createLocalEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  const content = `# Local development environment with offline mode
OFFLINE_MODE=true
USE_MOCK_DATA=true

# Local database configuration (optional)
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/airbnb_local"

# Supabase settings (leave unchanged but ignored in offline mode)
SUPABASE_URL=${process.env.SUPABASE_URL || 'https://your-project-ref.supabase.co'}
SUPABASE_KEY=${process.env.SUPABASE_KEY || 'your-anon-key'}
SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key'}

# Debug settings
DEBUG=airbnb-backend:*
NODE_ENV=development
`;

  fs.writeFileSync(envPath, content);
  console.log(`✅ Created ${envPath} with offline mode enabled`);
}

// Create a script to switch between modes
function createSwitchScript() {
  const scriptPath = path.join(__dirname, '../switch-mode.js');
  const content = `#!/usr/bin/env node
/**
 * Switch between online and offline mode
 * Usage: node switch-mode.js [online|offline]
 */
const fs = require('fs');
const path = require('path');

const mode = process.argv[2]?.toLowerCase();
const validModes = ['online', 'offline'];

if (!validModes.includes(mode)) {
  console.log('Usage: node switch-mode.js [online|offline]');
  console.log('  online  - Use remote Supabase database');
  console.log('  offline - Use local database or mock data');
  process.exit(1);
}

const envPath = path.join(__dirname, '.env');
const onlinePath = path.join(__dirname, '.env.online');
const offlinePath = path.join(__dirname, '.env.local');

// Make sure we have the needed files
if (mode === 'online' && !fs.existsSync(onlinePath)) {
  console.error('❌ .env.online file not found!');
  console.log('First, run: cp .env .env.online');
  process.exit(1);
}

if (mode === 'offline' && !fs.existsSync(offlinePath)) {
  console.error('❌ .env.local file not found!');
  console.log('First, run: node scripts/setup-local-fallback.js');
  process.exit(1);
}

// Back up current .env file if it exists and doesn't have a backup yet
if (fs.existsSync(envPath) && !fs.existsSync(\`\${envPath}.backup\`)) {
  fs.copyFileSync(envPath, \`\${envPath}.backup\`);
  console.log(\`✅ Created backup of current settings at \${envPath}.backup\`);
}

// Copy the appropriate file to .env
const sourcePath = mode === 'online' ? onlinePath : offlinePath;
fs.copyFileSync(sourcePath, envPath);
console.log(\`✅ Switched to \${mode} mode. Configuration copied from \${sourcePath}\`);
console.log('Restart your application for changes to take effect.');
`;

  fs.writeFileSync(scriptPath, content);
  console.log(`✅ Created switch-mode.js script`);
  
  // Make it executable on Unix-like systems
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(scriptPath, 0o755);
    } catch {}
  }
}

// Update package.json with switch scripts
function updatePackageJson() {
  const packagePath = path.join(__dirname, '../package.json');
  if (!fs.existsSync(packagePath)) {
    console.log('❌ package.json not found');
    return;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Add scripts if they don't exist
  if (!packageJson.scripts) packageJson.scripts = {};
  
  packageJson.scripts['use-online'] = 'node switch-mode.js online';
  packageJson.scripts['use-offline'] = 'node switch-mode.js offline';
  packageJson.scripts['setup-offline'] = 'node scripts/setup-local-fallback.js';
  
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  console.log(`✅ Updated package.json with mode switching scripts`);
}

// Create a backup of the original .env
function backupOriginalEnv() {
  const envPath = path.join(__dirname, '../.env');
  const onlinePath = path.join(__dirname, '../.env.online');
  
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, onlinePath);
    console.log(`✅ Backed up original .env to .env.online`);
  } else {
    console.log(`⚠️ No .env file found to backup`);
  }
}

// Main function
async function main() {
  console.log('========= LOCAL DATABASE FALLBACK SETUP =========\n');
  
  console.log('This script will set up a local fallback configuration');
  console.log('for when you cannot connect to remote Supabase database.\n');
  
  const proceed = await prompt('Proceed with setup? (y/n): ');
  if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
    console.log('Setup cancelled');
    process.exit(0);
  }
  
  // Create the necessary files
  backupOriginalEnv();
  createLocalEnv();
  createSwitchScript();
  updatePackageJson();
  
  console.log('\n✅ Setup completed successfully!');
  console.log('You can now use the following commands:');
  console.log('  npm run use-online  - Switch to online mode (remote Supabase)');
  console.log('  npm run use-offline - Switch to offline mode (local fallback)');
  console.log('\nTo start in offline mode immediately, run:');
  console.log('  npm run use-offline && npm run dev');
}

main().catch(error => {
  console.error('Error during setup:', error);
  process.exit(1);
});
