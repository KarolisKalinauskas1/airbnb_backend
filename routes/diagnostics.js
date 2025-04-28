const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get database schema information
router.get('/schema', async (req, res) => {
  try {
    // This is a simplified approach - in a real app you might query
    // information_schema or use Prisma's introspection capabilities
    
    const tables = {
      camping_spot: {
        fields: {
          camping_spot_id: { type: 'integer', maxLength: null, primary: true },
          title: { type: 'varchar', maxLength: 255 }, // Adjust based on your schema
          description: { type: 'text', maxLength: 2000 }, // Adjust based on your schema
          price_per_night: { type: 'decimal', maxLength: null },
          max_guests: { type: 'integer', maxLength: null },
          owner_id: { type: 'integer', maxLength: null },
          location_id: { type: 'integer', maxLength: null },
          created_at: { type: 'timestamp', maxLength: null },
          updated_at: { type: 'timestamp', maxLength: null }
        }
      },
      location: {
        fields: {
          location_id: { type: 'integer', maxLength: null, primary: true },
          address_line1: { type: 'varchar', maxLength: 255 }, // Adjust based on your schema
          address_line2: { type: 'varchar', maxLength: 255 }, // Adjust based on your schema
          city: { type: 'varchar', maxLength: 100 }, // Adjust based on your schema
          postal_code: { type: 'varchar', maxLength: 20 }, // Adjust based on your schema
          country_id: { type: 'integer', maxLength: null },
          longtitute: { type: 'varchar', maxLength: 20 }, // Adjust based on your schema
          latitute: { type: 'varchar', maxLength: 20 } // Adjust based on your schema
        }
      }
    };
    
    res.json(tables);
  } catch (error) {
    console.error('Schema Error:', error);
    res.status(500).json({ error: 'Failed to fetch schema information' });
  }
});

// Test field length constraints
router.post('/field-test', async (req, res) => {
  try {
    const { table, data } = req.body;
    
    if (!table || !data) {
      return res.status(400).json({ error: 'Table and data are required' });
    }
    
    // Log received data for debugging
    console.log('Diagnostic test - Table:', table);
    console.log('Diagnostic test - Data:', data);
    
    // Return the analysis without actually inserting to database
    const analysis = {
      table,
      fields: {}
    };
    
    // Analyze each field in the data
    for (const [field, value] of Object.entries(data)) {
      let result = {
        length: String(value).length,
        status: 'unknown'
      };
      
      // Known field constraints - update these based on your actual DB schema
      const constraints = {
        camping_spot: {
          title: 255,
          description: 2000,
        },
        location: {
          address_line1: 255,
          address_line2: 255,
          city: 100,
          postal_code: 20,
          longtitute: 20,
          latitute: 20
        }
      };
      
      if (constraints[table] && constraints[table][field] !== undefined) {
        const maxLength = constraints[table][field];
        result.maxLength = maxLength;
        result.status = value.length <= maxLength ? 'ok' : 'too_long';
      }
      
      analysis.fields[field] = result;
    }
    
    res.json(analysis);
  } catch (error) {
    console.error('Field Test Error:', error);
    res.status(500).json({ 
      error: 'Failed to test field constraints',
      details: error.message 
    });
  }
});

// Simple diagnostic endpoint for content type testing
router.get('/content-types', (req, res) => {
  res.json({
    success: true,
    requestHeaders: {
      accept: req.headers.accept,
      contentType: req.headers['content-type']
    },
    responseHeaders: {
      contentType: res.getHeader('Content-Type')
    },
    message: 'This endpoint validates proper JSON content negotiation'
  });
});

// Echo endpoint to test request/response
router.post('/echo', (req, res) => {
  res.json({
    success: true,
    requestMethod: req.method,
    requestHeaders: req.headers,
    requestBody: req.body,
    timestamp: new Date().toISOString()
  });
});

/**
 * Diagnostics endpoints for debugging API issues
 */

// Test JSON content negotiation
router.get('/content-type-test', (req, res) => {
  res.json({
    success: true,
    message: 'If you can see this as JSON, content negotiation is working correctly',
    responseHeaders: {
      'content-type': res.getHeader('Content-Type')
    },
    headersSent: res._headersSent 
  });
});

// Echo back the request details for debugging
router.post('/echo', (req, res) => {
  res.json({
    success: true,
    method: req.method,
    path: req.path,
    headers: req.headers,
    query: req.query,
    body: req.body
  });
});

// Basic health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    acceptHeader: req.headers.accept,
    contentType: res.getHeader('Content-Type')
  });
});

// Content negotiation test
router.get('/content-test', (req, res) => {
  res.json({
    success: true,
    message: 'Content negotiation is working correctly',
    requestInfo: {
      method: req.method,
      path: req.path,
      fullUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
      headers: {
        accept: req.headers.accept,
        contentType: req.headers['content-type'],
        xRequestedWith: req.headers['x-requested-with']
      }
    },
    responseHeaders: {
      contentType: res.getHeader('Content-Type')
    }
  });
});

// CORS test
router.get('/cors-test', (req, res) => {
  // Send CORS headers explicitly on this response
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.json({
    success: true,
    message: 'CORS is functioning correctly',
    requestHeaders: {
      origin: req.headers.origin,
      host: req.headers.host,
      accept: req.headers.accept,
      'user-agent': req.headers['user-agent']
    },
    responseHeaders: {
      'access-control-allow-origin': res.getHeader('Access-Control-Allow-Origin'),
      'access-control-allow-credentials': res.getHeader('Access-Control-Allow-Credentials'),
      'content-type': res.getHeader('Content-Type')
    }
  });
});

// Test middleware chain
router.get('/middleware-test', (req, res) => {
  res.json({
    success: true,
    message: 'Middleware chain is working correctly',
    path: req.path,
    // Include any request processing info added by middleware
    middlewareInfo: req.middlewareInfo || 'No middleware info available'
  });
});

// Add a debug endpoint to check request headers
router.get('/request-debug', (req, res) => {
  res.json({
    method: req.method,
    url: req.url,
    path: req.path,
    headers: req.headers,
    query: req.query,
    contentType: res.getHeader('Content-Type'),
    // Don't include auth tokens in logs
    auth: req.headers.authorization ? 'Present (masked)' : 'Not present' 
  });
});

// Add a specific debug endpoint for full-info requests
router.get('/test-full-info', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      error: 'No token provided',
      headers: req.headers
    });
  }
  
  try {
    const decoded = jwt.decode(token);
    
    return res.json({
      success: true,
      decodedToken: {
        id: decoded.id || decoded.sub,
        email: decoded.email,
        exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
      },
      headers: {
        contentType: req.headers['content-type'],
        accept: req.headers.accept
      }
    });
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid token',
      message: error.message
    });
  }
});

/**
 * Diagnostic routes for troubleshooting
 */
const { testConnection } = require('../config/supabase');

// Add basic authentication to this endpoint
const basicAuth = (req, res, next) => {
  // Only require authentication in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="Diagnostics"');
      return res.status(401).send('Authentication required');
    }
    
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    
    // Very simple hardcoded check - in real app use proper auth
    if (username !== 'admin' || password !== 'diagadmin') {
      return res.status(401).send('Invalid credentials');
    }
  }
  
  next();
};

/**
 * @route   GET /api/diagnostics/auth
 * @desc    Check authentication configuration
 * @access  Protected
 */
router.get('/auth', basicAuth, async (req, res) => {
  // Check environment and configuration
  const authConfig = {
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseAnonKey: !!(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY),
      hasSupabaseServiceKey: !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
    }
  };

  // Check Supabase connection
  let supabaseStatus = { configured: false };
  try {
    supabaseStatus = await testConnection();
  } catch (error) {
    supabaseStatus.error = error.message;
  }
  
  // Check database connection
  let dbStatus = { connected: false };
  try {
    // Try a simple query
    await prisma.$queryRaw`SELECT 1 as result`;
    dbStatus.connected = true;
  } catch (error) {
    dbStatus.error = error.message;
  }
  
  // Return all diagnostic info
  res.json({
    timestamp: new Date().toISOString(),
    authConfig,
    supabase: supabaseStatus,
    database: dbStatus
  });
});

module.exports = router;
