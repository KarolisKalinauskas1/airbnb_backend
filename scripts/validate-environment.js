const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Define required environment variables
const requiredVars = {
    // Server
    'PORT': 'Server port (default: 3000)',
    'HOST': 'Server host (default: localhost)',
    
    // Database
    'DATABASE_URL': 'PostgreSQL connection string',
    'DIRECT_URL': 'Direct database connection URL',
    
    // Authentication
    'JWT_SECRET': 'Secret key for JWT tokens',
    'SUPABASE_URL': 'Supabase project URL',
    'SUPABASE_ANON_KEY': 'Supabase anonymous key',
    'SUPABASE_SERVICE_ROLE_KEY': 'Supabase service role key',
    
    // CORS and Frontend
    'CORS_ORIGIN': 'Frontend URL for CORS',
    'FRONTEND_URL': 'Frontend application URL',
    
    // Environment
    'NODE_ENV': 'Environment (development/production)'
};

function validateEnvVarType(name, value) {
    const numberVariables = ['PORT'];
    const urlVariables = ['DATABASE_URL', 'DIRECT_URL'];
    const corsOriginPattern = /^https?:\/\/[^,\s]+(?:\s*,\s*https?:\/\/[^,\s]+)*$/;
    
    if (numberVariables.includes(name)) {
        return !isNaN(value) && Number.isFinite(Number(value));
    }
    
    if (urlVariables.includes(name)) {
        try {
            if (name === 'DATABASE_URL' || name === 'DIRECT_URL') {
                // Special case for postgres URLs
                return value.startsWith('postgresql://');
            }
            new URL(value);
            return true;
        } catch {
            return false;
        }
    }

    if (name === 'CORS_ORIGIN') {
        // Allow comma-separated list of URLs
        return corsOriginPattern.test(value);
    }
    
    return true;
}

function validateEnvironment() {
    console.log('Validating environment variables...');
    let hasErrors = false;

    // Set default values for optional variables
    process.env.PORT = process.env.PORT || '3000';
    process.env.HOST = process.env.HOST || 'localhost';
    process.env.NODE_ENV = process.env.NODE_ENV || 'development';

    // Check required variables
    for (const [name, description] of Object.entries(requiredVars)) {
        const value = process.env[name];
        
        // Skip validation for optional variables that have defaults
        if (!value && ['PORT', 'HOST', 'NODE_ENV'].includes(name)) {
            console.log(`ℹ️ Using default value for ${name}`);
            continue;
        }
        
        if (!value) {
            console.error(`❌ Missing ${name}: ${description}`);
            hasErrors = true;
            continue;
        }

        if (!validateEnvVarType(name, value)) {
            console.error(`❌ Invalid ${name}: Value does not match expected format`);
            hasErrors = true;
        }
    }

    if (hasErrors) {
        console.error('❌ Environment validation failed');
        process.exit(1);
    }

    console.log('✅ Environment validation passed');
}

// Only run validation if not explicitly skipped
if (!process.env.SKIP_ENV_VALIDATION) {
    validateEnvironment();
}
