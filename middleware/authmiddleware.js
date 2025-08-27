// authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try { 
    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    console.log('Auth header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'No token provided. Please include Authorization header with Bearer token.' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Extracted token:', token.substring(0, 20) + '...');

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    console.log('Decoded token:', decoded);

    // Find the user
    const user = await User.findById(decoded.userId);
    console.log('Found user:', user ? user.email : 'No user found');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Set user information in request
    req.user = {
      userId: decoded.userId,
      id: decoded.userId, // Add id as well for compatibility
      _id: decoded.userId, // Add _id as well for compatibility
      email: user.email,
      name: user.name,
      isVerified: user.isVerified,
      userObject: user,
      ...decoded
    };

    console.log('req.user set to:', req.user);
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    
    res.status(401).json({ message: 'Authentication failed' });
  }
};

module.exports = authMiddleware;