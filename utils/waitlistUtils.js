// utils/waitlistUtils.js
const crypto = require('crypto');

exports.validateEmail = (email) => {
  const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  return regex.test(email);
};

exports.generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};