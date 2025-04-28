const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config');
const { ValidationError } = require('../middleware/error');
const { verifyToken, jwtConfig } = require('../config');

// Register new user
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, isowner } = req.body;

    // Validate input
    if (!name || !email || !password) {
      throw new ValidationError('Name, email and password are required');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        isowner: isowner || false
      },
      select: {
        id: true,
        name: true,
        email: true,
        isowner: true,
        createdAt: true
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, isowner: user.isowner },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      user,
      token
    });
  } catch (error) {
    next(error);
  }
});

// Login user
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Find user
    const user = await prisma.public_users.findUnique({
      where: { email }
    });

    if (!user) {
      throw new ValidationError('Invalid credentials');
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new ValidationError('Invalid credentials');
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.user_id,
        email: user.email,
        isowner: user.isowner 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        isowner: Number(user.isowner) || 0,
        verified: user.verified
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/sync-session
 * @desc    Sync session with backend and return user data
 * @access  Public
 */
router.post('/sync-session', async (req, res) => {
  try {
    // Check for token in headers, cookies, or request body
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                 req.cookies.token || 
                 req.body.token;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify and decode the token
    const decoded = verifyToken(token);
    if (!decoded || !decoded.email) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user from database
    const user = await prisma.public_users.findUnique({
      where: {
        email: decoded.email
      },
      select: {
        user_id: true,
        email: true,
        full_name: true,
        isowner: true,
        verified: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Return user data
    res.json({
      user: {
        ...user,
        isowner: Number(user.isowner) || 0
      }
    });
  } catch (error) {
    console.error('Session sync error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh an expired JWT token
 * @access  Public
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify the token (but ignore expiration)
    const decoded = jwt.verify(token, jwtConfig.secret, { ignoreExpiration: true });

    // Get user from database
    const user = await prisma.users.findUnique({
      where: {
        email: decoded.email
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new token
    const newToken = jwt.sign(
      { 
        id: user.user_id,
        email: user.email,
        isowner: user.isowner 
      },
      jwtConfig.secret,
      { expiresIn: '24h' }
    );

    res.json({
      token: newToken,
      user: {
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        isowner: Number(user.isowner) || 0,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router; 