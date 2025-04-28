/**
 * Debug routes to help diagnose authentication and user data issues
 * These should be disabled in production
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const schemaChecker = require('../utils/schema-checker');

const prisma = new PrismaClient();

// Debug route to test authentication and user data retrieval
router.get('/auth-check', async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Debug routes disabled in production' });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'No token provided',
        headers: req.headers
      });
    }
    
    // Extract the token
    const token = authHeader.split(' ')[1];
    const tokenFirstChars = token.substring(0, 10);
    const tokenLength = token.length;
    
    // Try to find JWT_SECRET
    const jwtSecret = process.env.JWT_SECRET;
    const hasJwtSecret = !!jwtSecret;
    
    // Check token without verifying
    const isJwt = token.split('.').length === 3;
    
    // Show database tables
    const userTables = [];
    const tables = ['public_users', 'users', 'Users', 'User'];
    
    for (const table of tables) {
      try {
        if (prisma[table]) {
          const count = await prisma[table].count();
          userTables.push({
            name: table,
            exists: true,
            count
          });
        } else {
          userTables.push({
            name: table,
            exists: false
          });
        }
      } catch (error) {
        userTables.push({
          name: table,
          exists: false,
          error: error.message
        });
      }
    }
    
    res.json({
      token: {
        prefix: tokenFirstChars + '...',
        length: tokenLength,
        isJwt
      },
      jwtSecret: {
        exists: hasJwtSecret,
        length: jwtSecret?.length || 0
      },
      database: {
        connected: true,
        userTables
      }
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ error: error.message });
  }
});

// A debug endpoint to get information about the environment and database
router.get('/system-info', async (req, res) => {
  try {
    // Don't allow in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Debug endpoints disabled in production' });
    }
    
    const databaseTables = await schemaChecker.listDatabaseTables();
    const prismaModels = schemaChecker.listPrismaModels();
    
    // Get counts for important tables
    const tableCounts = {};
    for (const model of prismaModels) {
      try {
        tableCounts[model] = await schemaChecker.countTableRecords(model);
      } catch (error) {
        tableCounts[model] = { error: error.message };
      }
    }
    
    res.json({
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        databaseUrl: process.env.DATABASE_URL ? 
          (process.env.DATABASE_URL.substring(0, 20) + '...') : 
          'Not set',
        jwtSecret: process.env.JWT_SECRET ? 
          (process.env.JWT_SECRET.length + ' chars') : 
          'Not set',
      },
      database: {
        availableTables: databaseTables,
        prismaModels,
        tableCounts
      },
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ 
      error: error.message, 
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined 
    });
  }
});

// Endpoint to test token verification
router.get('/token-info', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Debug endpoints disabled in production' });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({ error: 'No token provided in Authorization header' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // First try to decode without verification to see what's in the token
    let decodedNoVerify;
    try {
      decodedNoVerify = jwt.decode(token);
    } catch (e) {
      decodedNoVerify = { error: e.message };
    }
    
    // Now try to verify the token
    let verifyResult;
    let decodedWithVerify;
    try {
      decodedWithVerify = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_please_change');
      verifyResult = { success: true };
    } catch (e) {
      verifyResult = { 
        success: false, 
        error: e.message,
        type: e.name
      };
    }
    
    // If we have an email in the token, try to look up the user
    let userLookupResult = {};
    if (decodedNoVerify?.email) {
      userLookupResult = await schemaChecker.findUserInAllTables(decodedNoVerify.email);
    }
    
    res.json({
      tokenData: {
        decoded: decodedNoVerify,
        verification: verifyResult,
        verified: decodedWithVerify
      },
      userLookup: userLookupResult
    });
  } catch (error) {
    console.error('Debug token endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
