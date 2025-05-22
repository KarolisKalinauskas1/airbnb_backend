const fs = require('fs');
const path = require('path');

// Define required environment variables
const requiredVars = {
    // Database
    'DATABASE_URL': 'PostgreSQL connection string',
    'DIRECT_URL': 'Direct database connection URL',
    
    // Authentication
    'JWT_SECRET': 'Secret key for JWT tokens',
    
    // CORS and Frontend
    'CORS_ORIGIN': 'Frontend URL for CORS',
    
    // Environment
    'NODE_ENV': 'Environment (development/production)'
};

function validateEnvVarType(name, value) {
    const numberVariables = ['PORT'];
    const urlVariables = ['DATABASE_URL', 'DIRECT_URL', 'CORS_ORIGIN'];
    
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
    
    return true;
}

function validateEnvironment() {
    console.log('Validating environment variables...');
    let hasErrors = false;

    // Check required variables
    for (const [name, description] of Object.entries(requiredVars)) {
        if (!process.env[name]) {
            console.error(`❌ Missing ${name}: ${description}`);
            hasErrors = true;
            continue;
        }

        if (!validateEnvVarType(name, process.env[name])) {
            console.error(`❌ Invalid value for ${name}`);
            hasErrors = true;
            continue;
        }

        console.log(`✅ ${name} is set`);
    }

    // Special validation for production
    if (process.env.NODE_ENV === 'production') {
        // In production, we're running in Railway so we need these
        if (!process.env.RAILWAY_STATIC_URL) {
            console.error('❌ Missing RAILWAY_STATIC_URL in production');
            hasErrors = true;
        }
    }

    if (hasErrors) {
        console.error('❌ Environment validation failed');
        // In production, exit with error if validation fails
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    } else {
        console.log('✅ All required environment variables are set');
    }
}

// Only run validation if not explicitly skipped
if (!process.env.SKIP_ENV_VALIDATION) {
    validateEnvironment();
}
