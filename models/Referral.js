// models/Referral.js
const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: { type: String, required: true, index: true },
  referredUserId: { type: String, required: true, unique: true, index: true },
  referralCode: { type: String, required: true, index: true },
  userType: { type: String, enum: ['website_owner', 'advertiser'], required: true },
  status: { 
    type: String, 
    enum: ['pending', 'website_created', 'category_created', 'qualified'],
    default: 'pending'
  },
  referredUserDetails: {
    firstName: String,
    lastName: String,
    email: String,
    createdAt: Date
  },
  websiteDetails: [{
    websiteId: String,
    websiteName: String,
    websiteLink: String,
    createdAt: Date
  }],
  categoryDetails: [{
    categoryId: String,
    categoryName: String,
    createdAt: Date
  }],
  createdAt: { type: Date, default: Date.now },
  qualifiedAt: Date,
  lastUpdated: { type: Date, default: Date.now },
  completionProgress: { type: Number, default: 0 }
});

referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ referralCode: 1 });

const Referral = mongoose.model('Referral', referralSchema);
module.exports = Referral;