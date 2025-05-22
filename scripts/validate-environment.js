const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const requiredVars = {
    // Database
    'DATABASE_URL': 'PostgreSQL connection string',
    'DIRECT_URL': 'Direct database connection URL',
    
    // Authentication
    'JWT_SECRET': 'Secret key for JWT tokens',
    'JWT_EXPIRY': 'JWT token expiry time',
    
    // Supabase
    'SUPABASE_URL': 'Supabase project URL',
    'SUPABASE_ANON_KEY': 'Supabase anonymous key',
    'SUPABASE_SERVICE_ROLE_KEY': 'Supabase service role key',
    
    // Stripe
    'STRIPE_SECRET_KEY': 'Stripe secret key',
    'STRIPE_WEBHOOK_SECRET': 'Stripe webhook secret',
    'VITE_STRIPE_PUBLISHABLE_KEY': 'Stripe publishable key',
    
    // Email
    'MAILGUN_API_KEY': 'Mailgun API key',
    'MAILGUN_DOMAIN': 'Mailgun domain',
    'EMAIL_FROM': 'Email sender address',
    
    // CORS
    'CORS_ORIGIN': 'Frontend URL for CORS',
    'FRONTEND_URL': 'Frontend application URL',
    
    // Other
    'NODE_ENV': 'Environment (development/production)',
    'PORT': 'Server port number'
};

function validateEnvVarType(name, value) {
    const numberVariables = ['PORT', 'BCRYPT_SALT_ROUNDS'];
    const urlVariables = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'FRONTEND_URL'];
    const booleanVariables = ['ENABLE_RATE_LIMIT', 'ENABLE_CACHE'];
    
    if (numberVariables.includes(name)) {
        return !isNaN(value) && Number.isFinite(Number(value));
    }
    
    if (urlVariables.includes(name)) {
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    }
    
    if (booleanVariables.includes(name)) {
        return ['true', 'false', '1', '0'].includes(value.toLowerCase());
    }
    
    return true;
}

function validateEnvVar(name, value, description) {
    if (!value) {
        console.log(chalk.red(`❌ Missing ${name}: ${description}`));
        return false;
    }

    if (!validateEnvVarType(name, value)) {
        console.log(chalk.red(`❌ Invalid type for ${name}`));
        return false;
    }

    // Additional validation based on variable type
    switch (name) {
        case 'JWT_SECRET':
            if (value.length < 32) {
                console.log(chalk.yellow(`⚠️ Warning: ${name} should be at least 32 characters long`));
            }
            break;
            
        case 'STRIPE_SECRET_KEY':
            if (!value.startsWith('sk_')) {
                console.log(chalk.red(`❌ Invalid ${name}: Must start with 'sk_'`));
                return false;
            }
            break;
            
        case 'STRIPE_WEBHOOK_SECRET':
            if (!value.startsWith('whsec_')) {
                console.log(chalk.red(`❌ Invalid ${name}: Must start with 'whsec_'`));
                return false;
            }
            break;
            
        case 'SUPABASE_ANON_KEY':
        case 'SUPABASE_SERVICE_ROLE_KEY':
            if (!value.includes('.')) {
                console.log(chalk.red(`❌ Invalid ${name}: Invalid format`));
                return false;
            }
            break;
    }
    
    console.log(chalk.green(`✓ ${name} is valid`));
    return true;
}

function validateEnv(envPath) {
    console.log(chalk.blue('\nValidating environment variables...\n'));
    
    if (!fs.existsSync(envPath)) {
        console.log(chalk.red(`❌ Environment file not found: ${envPath}`));
        return false;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    // Parse .env file
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const [, key, value] = match;
            envVars[key.trim()] = value.trim();
        }
    });
    
    let isValid = true;
    
    // Validate each required variable
    for (const [name, description] of Object.entries(requiredVars)) {
        if (!validateEnvVar(name, envVars[name], description)) {
            isValid = false;
        }
    }
    
    // Summary
    console.log('\n' + chalk.blue('Environment validation summary:'));
    if (isValid) {
        console.log(chalk.green('✓ All required environment variables are properly configured\n'));
    } else {
        console.log(chalk.red('❌ Some environment variables are missing or invalid\n'));
    }
    
    return isValid;
}

// Check both backend and frontend .env files
const backendEnvPath = path.join(__dirname, '..', '.env');
const frontendEnvPath = path.join(__dirname, '..', '..', 'airbnb_frontend', 'frontend', '.env');

console.log(chalk.blue('Checking Backend Environment:'));
const backendValid = validateEnv(backendEnvPath);

console.log(chalk.blue('\nChecking Frontend Environment:'));
const frontendValid = validateEnv(frontendEnvPath);

if (!backendValid || !frontendValid) {
    process.exit(1);
}

module.exports = { validateEnv };
