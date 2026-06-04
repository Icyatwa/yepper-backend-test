// authController.js (PostgreSQL)
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Generate JWT Token — always use user.id (PG UUID)
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-jwt-secret', {
    expiresIn: '7d'
  });
};

// ─── Email helpers ────────────────────────────────────────────────────────────

const buildVerificationHtml = (verificationUrl) => `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:20px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:white;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
          <tr><td style="padding:40px;">
            <h1 style="color:#333;font-size:24px;font-weight:bold;margin:0 0 10px 0;text-align:center;">Verify Your Email Address</h1>
            <p style="color:#666;font-size:16px;line-height:1.5;margin:0 0 30px 0;text-align:center;">
              Welcome! Please verify your email address to complete your account setup.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:20px 0;">
                <a href="${verificationUrl}" style="display:inline-block;background-color:#000;color:white;padding:16px 32px;text-decoration:none;font-weight:600;font-size:16px;border-radius:4px;">
                  Verify Email Address
                </a>
              </td></tr>
            </table>
            <p style="color:#999;font-size:14px;text-align:center;margin-top:30px;">This link expires in 1 hour.</p>
            <p style="color:#999;font-size:12px;text-align:center;margin-top:20px;">If you didn't create an account, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>
`;

const sendVerificationEmail = async (email, token, returnUrl = null) => {
  try {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
    let verificationUrl = `${process.env.FRONTEND_URL || 'https://yepper.cc'}/verify-email?token=${token}`;
    if (returnUrl) verificationUrl += `&returnUrl=${encodeURIComponent(returnUrl)}`;

    console.log('Sending email to:', email);
    console.log('Using API key:', process.env.RESEND_API_KEY.substring(0, 10) + '...');

    const { data, error } = await resend.emails.send({
      from: 'Yepper <noreply@yepper.cc>',
      to: email,
      subject: 'Verify Your Email Address',
      html: buildVerificationHtml(verificationUrl),
    });

    if (error) {
      console.error('Resend API Error:', error);
      throw new Error(`Failed to send email: ${error.message || JSON.stringify(error)}`);
    }

    console.log(`Email sent successfully to ${email}`);
    console.log(`Email ID: ${data.id}`);
    return data;
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
};

const sendWaitlistVerificationEmail = async (email, token, returnUrl = null) => {
  try {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
    let verificationUrl = `${process.env.WAITLIST_FRONTEND_URL || 'https://yepper.cc'}/verify-email?token=${token}`;
    if (returnUrl) verificationUrl += `&returnUrl=${encodeURIComponent(returnUrl)}`;

    console.log('Sending email to:', email);
    console.log('Using API key:', process.env.RESEND_API_KEY.substring(0, 10) + '...');

    const { data, error } = await resend.emails.send({
      from: 'Yepper <noreply@yepper.cc>',
      to: email,
      subject: 'Verify Your Email Address',
      html: buildVerificationHtml(verificationUrl),
    });

    if (error) {
      console.error('Resend API Error:', error);
      throw new Error(`Failed to send email: ${error.message || JSON.stringify(error)}`);
    }

    console.log(`Email sent successfully to ${email}`);
    console.log(`Email ID: ${data.id}`);
    return data;
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
};

const maskEmail = (email) => {
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return `${localPart[0]}*****@${domain}`;
  const visibleChars = Math.min(2, localPart.length - 1);
  return `${localPart.substring(0, visibleChars)}*****@${domain}`;
};

// ─── Controllers ─────────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  try {
    const { name, email, password, returnUrl } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      if (existingUser.is_verified) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists and is verified. Please sign in instead.',
        });
      } else {
        // Delete the unverified user and allow re-registration
        await User.delete(existingUser.id);
        console.log('Deleted unverified user for re-registration:', email);
      }
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    const user = await User.create({
      name,
      email,
      password,
      verificationToken,
      verificationTokenExpires,
      isVerified: false,
    });

    try {
      await sendVerificationEmail(email, verificationToken, returnUrl);
      res.status(201).json({
        success: true,
        requiresVerification: true,
        maskedEmail: maskEmail(email),
        message: 'Account created successfully. Please check your email to verify your account and get started.',
      });
    } catch (emailError) {
      await User.delete(user.id);
      console.error('Email sending failed:', emailError);
      res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again later.' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration. Please try again.' });
  }
};

exports.registerWaitlist = async (req, res) => {
  try {
    const { name, email, password, returnUrl } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      if (existingUser.is_verified) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists and is verified. Please sign in instead.',
        });
      } else {
        await User.delete(existingUser.id);
        console.log('Deleted unverified user for re-registration:', email);
      }
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 3600000);

    const user = await User.create({
      name,
      email,
      password,
      verificationToken,
      verificationTokenExpires,
      isVerified: false,
    });

    try {
      await sendWaitlistVerificationEmail(email, verificationToken, returnUrl);
      res.status(201).json({
        success: true,
        requiresVerification: true,
        maskedEmail: maskEmail(email),
        message: 'Account created successfully. Please check your email to verify your account and get started.',
      });
    } catch (emailError) {
      await User.delete(user.id);
      console.error('Email sending failed:', emailError);
      res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again later.' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration. Please try again.' });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token, returnUrl } = req.query;

    if (!token) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/verify-error?reason=missing_token`);
    }

    const user = await User.findByVerificationToken(token);
    if (!user || new Date(user.verification_token_expires) < new Date()) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/verify-error?reason=invalid_token`);
    }

    await User.update(user.id, {
      isVerified: true,
      verificationToken: null,
      verificationTokenExpires: null,
    });

    const authToken = generateToken(user.id);

    let redirectUrl = `${process.env.FRONTEND_URL || 'https://yepper.cc'}/verify-success?token=${authToken}&auto_login=true`;
    if (returnUrl) redirectUrl += '&fromDirectAdvertise=true';

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Email verification error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/verify-error?reason=server_error`);
  }
};

exports.verifyWaitlistEmail = async (req, res) => {
  try {
    const { token, returnUrl } = req.query;

    if (!token) {
      return res.redirect(`${process.env.WAITLIST_FRONTEND_URL || 'https://yepper.cc'}/verify-error?reason=missing_token`);
    }

    const user = await User.findByVerificationToken(token);
    if (!user || new Date(user.verification_token_expires) < new Date()) {
      return res.redirect(`${process.env.WAITLIST_FRONTEND_URL || 'https://yepper.cc'}/verify-error?reason=invalid_token`);
    }

    await User.update(user.id, {
      isVerified: true,
      verificationToken: null,
      verificationTokenExpires: null,
    });

    const authToken = generateToken(user.id);

    let redirectUrl = `${process.env.WAITLIST_FRONTEND_URL || 'https://yepper.cc'}/verify-success?token=${authToken}&auto_login=true`;
    if (returnUrl) redirectUrl += '&fromDirectAdvertise=true';

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Email verification error:', error);
    res.redirect(`${process.env.WAITLIST_FRONTEND_URL || 'https://yepper.cc'}/verify-error?reason=server_error`);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await User.comparePassword(user, password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    if (!user.is_verified) {
      return res.status(400).json({
        success: false,
        requiresVerification: true,
        maskedEmail: maskEmail(email),
        message: 'Please verify your email address first. Check your inbox for the verification email.',
      });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.is_verified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const { email, returnUrl } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email address.' });
    }

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'This email is already verified.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 3600000);

    await User.update(user.id, { verificationToken, verificationTokenExpires });

    try {
      await sendVerificationEmail(email, verificationToken, returnUrl);
      res.json({ success: true, message: 'Verification email sent successfully. Click the link in the email to verify and sign in.' });
    } catch (emailError) {
      res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

exports.resendWaitlistVerification = async (req, res) => {
  try {
    const { email, returnUrl } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email address.' });
    }

    if (user.is_verified) {
      return res.status(400).json({ success: false, message: 'This email is already verified.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 3600000);

    await User.update(user.id, { verificationToken, verificationTokenExpires });

    try {
      await sendWaitlistVerificationEmail(email, verificationToken, returnUrl);
      res.json({ success: true, message: 'Verification email sent successfully. Click the link in the email to verify and sign in.' });
    } catch (emailError) {
      res.status(500).json({ success: false, message: 'Failed to send verification email. Please try again.' });
    }
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.is_verified,
        googleId: user.google_id,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      success: true,
      user: {
        id: user.id,
        _id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.is_verified,
        googleId: user.google_id,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
};

exports.googleSuccess = async (req, res) => {
  if (req.user) {
    const token = generateToken(req.user.id || req.user._id);
    res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/success?token=${token}`);
  } else {
    res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/login?error=google_auth_failed`);
  }
};

exports.googleFailure = (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/login?error=google_auth_failed`);
};