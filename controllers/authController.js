// authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-jwt-secret', {
    expiresIn: '7d'
  });
};

// Email transporter setup
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email credentials not configured');
  }

  return nodemailer.createTransport({ // <--- CORRECT: Changed to createTransport
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send verification email with button
const sendVerificationEmail = async (email, token) => {
  const transporter = createTransporter();
  const verificationUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/verify-email?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your Email Address',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; 
            padding: 0; 
            background-color: #f5f5f5; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
            padding: 40px; 
            border-radius: 8px;
            margin-top: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
          }
          .title { 
            color: #333; 
            font-size: 24px; 
            font-weight: bold; 
            margin-bottom: 10px; 
          }
          .subtitle { 
            color: #666; 
            font-size: 16px; 
            line-height: 1.5; 
          }
          .verify-button { 
            display: inline-block; 
            background-color: #000; 
            color: white !important; 
            padding: 16px 32px; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 600; 
            font-size: 16px;
            margin: 30px 0;
            text-align: center;
          }
          .verify-button:hover { 
            background-color: #333; 
          }
          .footer { 
            text-align: center; 
            color: #999; 
            font-size: 14px; 
            margin-top: 30px; 
            line-height: 1.5;
          }
          .email-display {
            background-color: #f8f9fa;
            padding: 12px;
            border-radius: 4px;
            font-family: monospace;
            color: #333;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">Verify Your Email Address</h1>
            <p class="subtitle">
              Welcome! Please verify your email address to complete your account setup and get started.
            </p>
            <div class="email-display">${email}</div>
          </div>
          
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="verify-button">
              Verify Email Address & Sign In
            </a>
          </div>
          
          <div class="footer">
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't create an account, please ignore this email.</p>
            <p>If the button doesn't work, copy and paste this link:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
};

// FIXED: Enhanced register function - allows re-registration for unverified users
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, email, and password are required' 
      });
    }

    // Check if user exists with this email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ 
          success: false,
          message: 'An account with this email already exists and is verified. Please sign in instead.' 
        });
      } else {
        // FIXED: Delete the unverified user and allow re-registration
        await User.deleteOne({ email });
        console.log('Deleted unverified user for re-registration:', email);
      }
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    // Create user (always unverified initially)
    const user = new User({
      name,
      email,
      password,
      verificationToken,
      verificationTokenExpires,
      isVerified: false
    });

    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
      
      res.status(201).json({
        success: true,
        requiresVerification: true,
        maskedEmail: maskEmail(email),
        message: 'Account created successfully. Please check your email to verify your account and get started.'
      });
    } catch (emailError) {
      // If email fails to send, delete the user
      await User.deleteOne({ _id: user._id });
      console.error('Email sending failed:', emailError);
      
      res.status(500).json({ 
        success: false,
        message: 'Failed to send verification email. Please try again later.' 
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration. Please try again.' 
    });
  }
};

// FIXED: Enhanced email verification - directly verifies and signs user in
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-error?reason=missing_token`);
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-error?reason=invalid_token`);
    }

    // FIXED: Verify user and clear verification tokens
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    // FIXED: Generate JWT token for automatic sign-in
    const authToken = generateToken(user._id);

    // FIXED: Redirect with success and auto-login token
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-success?token=${authToken}&auto_login=true`);
  } catch (error) {
    console.error('Email verification error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-error?reason=server_error`);
  }
};

// Enhanced login function (unchanged but included for completeness)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    if (!user.isVerified) {
      return res.status(400).json({ 
        success: false,
        requiresVerification: true,
        maskedEmail: maskEmail(email),
        message: 'Please verify your email address first. Check your inbox for the verification email.' 
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
};

// Resend verification email (updated message)
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'No account found with this email address.' 
      });
    }

    if (user.isVerified) {
      return res.status(400).json({ 
        success: false,
        message: 'This email is already verified.' 
      });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 3600000);

    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    try {
      await sendVerificationEmail(email, verificationToken);
      res.json({ 
        success: true,
        message: 'Verification email sent successfully. Click the link in the email to verify and sign in.' 
      });
    } catch (emailError) {
      res.status(500).json({ 
        success: false,
        message: 'Failed to send verification email. Please try again.' 
      });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again.' 
    });
  }
};

// Utility function to mask email
const maskEmail = (email) => {
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}*****@${domain}`;
  }
  const visibleChars = Math.min(2, localPart.length - 1);
  const maskedPart = '*'.repeat(5);
  return `${localPart.substring(0, visibleChars)}${maskedPart}@${domain}`;
};

// Other methods remain the same...
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -verificationToken -resetPasswordToken');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.isVerified,
        googleId: user.googleId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await User.findById(req.user.userId).select('-password -verificationToken -resetPasswordToken');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.isVerified,
        googleId: user.googleId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

exports.googleSuccess = async (req, res) => {
  if (req.user) {
    const token = generateToken(req.user._id);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/success?token=${token}`);
  } else {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=google_auth_failed`);
  }
};

exports.googleFailure = (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=google_auth_failed`);
};