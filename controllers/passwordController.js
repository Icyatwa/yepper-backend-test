const User = require('../models/User');
const crypto = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    console.log('Forgot password request for email:', email);

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log('No user found with email:', email);
      return res.status(200).json({
        success: true,
        message: 'If this email exists, a password reset link will be sent.'
      });
    }

    console.log('User found:', user.email);

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Save token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    console.log('Reset token saved for user:', user.email);

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'https://yeffddfdper.vercel.app'}/reset-password?token=${resetToken}`;

    console.log('Sending reset email to:', email);

    // Send email
    const { data, error } = await resend.emails.send({
      from: 'Yepper <noreply@yepper.cc>',
      to: [email],
      subject: 'Reset Your Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset for your Yepper account.</p>
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Reset Password
          </a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Yepper Team</p>
        </div>
      `
    });

    if (error) {
      console.error('Email error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset email. Please try again.'
      });
    }

    console.log('Reset email sent successfully to:', email);

    res.json({
      success: true,
      message: 'If this email exists, a password reset link will be sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

exports.waitlistForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    console.log('Forgot password request for email:', email);

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log('No user found with email:', email);
      return res.status(200).json({
        success: true,
        message: 'If this email exists, a password reset link will be sent.'
      });
    }

    console.log('User found:', user.email);

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Save token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    console.log('Reset token saved for user:', user.email);

    // Create reset URL
    const resetUrl = `${process.env.WAITLIST_FRONTEND_URL || 'https://yeffddfdper.vercel.app'}/reset-password?token=${resetToken}`;

    console.log('Sending reset email to:', email);

    // Send email
    const { data, error } = await resend.emails.send({
      from: 'Yepper <noreply@yepper.cc>',
      to: [email],
      subject: 'Reset Your Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset for your Yepper account.</p>
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Reset Password
          </a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Yepper Team</p>
        </div>
      `
    });

    if (error) {
      console.error('Email error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset email. Please try again.'
      });
    }

    console.log('Reset email sent successfully to:', email);

    res.json({
      success: true,
      message: 'If this email exists, a password reset link will be sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    console.log('Reset password request received');
    console.log('Token:', token);
    console.log('Password length:', password ? password.length : 'no password');

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required.'
      });
    }

    // Find user by token and check expiry
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('Invalid or expired token');
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token.'
      });
    }

    console.log('User found for reset:', user.email);
    console.log('Current user password (hashed):', user.password);

    // Update the password - this will trigger the pre-save middleware to hash it
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    // Save the user - this should trigger the pre-save middleware
    await user.save();

    console.log('User saved successfully after password reset');

    // Verify the password was updated by fetching the user again
    const updatedUser = await User.findById(user._id);
    console.log('Password after reset (hashed):', updatedUser.password);
    console.log('Password changed:', updatedUser.password !== user.password);

    // Test the new password
    const isPasswordValid = await updatedUser.comparePassword(password);
    console.log('New password verification test:', isPasswordValid);

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};