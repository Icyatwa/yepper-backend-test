// controllers/authController.js
const User = require('../models/authModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env;

// Login handler
exports.login = async (req, res) => {
  const { email, password } = req.body;

  // Ensure the email matches the one from .env
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ message: 'Access Denied' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Compare the password from the request with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate a JWT token upon successful login
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin initialization
exports.initAdmin = async () => {
  try {
    // Check if the admin already exists in the database
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });

    if (!existingAdmin) {
      // Hash the admin password from the .env file
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

      // Create the admin user with the hashed password
      const newAdmin = new User({
        email: ADMIN_EMAIL,
        password: hashedPassword,
      });

      await newAdmin.save();
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }
  } catch (error) {
    console.error('Error initializing admin user', error);
  }
};
