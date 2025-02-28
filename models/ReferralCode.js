// models/ReferralCode.js
const mongoose = require('mongoose');

const referralCodeSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  code: { type: String, required: true, unique: true, index: true },
  userType: { type: String, enum: ['promoter', 'website_owner', 'advertiser'], required: true },
  totalReferrals: { type: Number, default: 0 },
  totalQualifiedReferrals: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now }
});

const ReferralCode = mongoose.model('ReferralCode', referralCodeSchema);
module.exports = ReferralCode;