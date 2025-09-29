// authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try { 
    // Get token from Authorization header
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided. Please include Authorization header with Bearer token.' 
      });
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided' 
      });
    }

    // FIXED: Better JWT secret handling
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('JWT_SECRET environment variable is not set!');
      return res.status(500).json({ 
        success: false,
        message: 'Server configuration error' 
      });
    }

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid token' 
        });
      }
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          message: 'Token expired',
          expired: true
        });
      }
      
      return res.status(401).json({ 
        success: false,
        message: 'Token verification failed' 
      });
    }

    // Find the user with timeout
    let user;
    try {
      // FIXED: Add timeout and better error handling for database queries
      user = await Promise.race([
        User.findById(decoded.userId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database timeout')), 5000)
        )
      ]);
    } catch (dbError) {
      console.error('Database error in auth middleware:', dbError);
      return res.status(500).json({ 
        success: false,
        message: 'Database connection error' 
      });
    }

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // FIXED: Check if user is still active/verified if needed
    if (!user.isVerified) {
      return res.status(401).json({ 
        success: false,
        message: 'Account not verified',
        requiresVerification: true
      });
    }

    // Set user information in request
    req.user = {
      userId: decoded.userId,
      id: decoded.userId,
      _id: decoded.userId,
      email: user.email,
      name: user.name,
      isVerified: user.isVerified,
      userObject: user,
      ...decoded
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware unexpected error:', error);
    
    // FIXED: Don't expose internal errors to client
    res.status(500).json({ 
      success: false,
      message: 'Authentication service temporarily unavailable' 
    });
  }
};

module.exports = authMiddleware;