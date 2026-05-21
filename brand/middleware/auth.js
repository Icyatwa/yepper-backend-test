// Auth.js
const jwt = require('jsonwebtoken');
const Brand_User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null;

    if (!token) return res.status(401).json({ error: 'Not authorized, no token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await Brand_User.findById(decoded.id).select('-password');

    if (!req.user) return res.status(401).json({ error: 'User not found' });

    next();
  } catch (err) {
    res.status(401).json({ error: 'Not authorized, token failed' });
  }
};