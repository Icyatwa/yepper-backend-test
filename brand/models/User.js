// User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const socialAccountSchema = new mongoose.Schema({
  platform: { type: String, enum: ['instagram', 'youtube'], required: true },
  platformUserId: String,
  username: String,
  displayName: String,
  profilePicture: String,
  accessToken: String,
  refreshToken: String,
  tokenExpiry: Date,
  connectedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, minlength: 6 },
  avatar: String,
  socialAccounts: [socialAccountSchema],
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getSocialAccount = function (platform) {
  return this.socialAccounts.find(a => a.platform === platform && a.isActive);
};

module.exports = mongoose.model('Brand_User', userSchema);
