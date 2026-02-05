// models/UserUsage.js
const mongoose = require('mongoose');

const userUsageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  totalGenerations: {
    type: Number,
    default: 0
  },
  generationsToday: {
    type: Number,
    default: 0
  },
  lastGenerationDate: {
    type: Date,
    default: Date.now
  },
  accountCreatedAt: {
    type: Date,
    default: Date.now
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  premiumExpiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Check if user is in free trial period (3 months)
userUsageSchema.methods.isInFreeTrial = function() {
  if (this.isPremium) return false;
  
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  return this.accountCreatedAt > threeMonthsAgo;
};

// Check if user can generate (daily limit: 10 for free trial)
userUsageSchema.methods.canGenerate = function() {
  const today = new Date().toDateString();
  const lastGenDate = this.lastGenerationDate ? new Date(this.lastGenerationDate).toDateString() : null;
  
  // Reset daily counter if it's a new day
  if (lastGenDate !== today) {
    this.generationsToday = 0;
  }
  
  // Premium users: unlimited
  if (this.isPremium) {
    return { allowed: true, reason: 'premium' };
  }
  
  // Free trial users: check if trial expired
  if (!this.isInFreeTrial()) {
    return { 
      allowed: false, 
      reason: 'trial_expired',
      message: 'Your 3-month free trial has ended. Upgrade to Premium to continue generating advertisements!'
    };
  }
  
  // Free trial users: 10 per day
  if (this.generationsToday >= 10) {
    return { 
      allowed: false, 
      reason: 'daily_limit',
      message: `Daily limit reached (10 generations/day). Come back tomorrow or upgrade to Premium for unlimited generations!`
    };
  }
  
  return { allowed: true, reason: 'free_trial' };
};

// Increment usage
userUsageSchema.methods.incrementUsage = async function() {
  const today = new Date().toDateString();
  const lastGenDate = this.lastGenerationDate ? new Date(this.lastGenerationDate).toDateString() : null;
  
  // Reset daily counter if new day
  if (lastGenDate !== today) {
    this.generationsToday = 0;
  }
  
  this.generationsToday += 1;
  this.totalGenerations += 1;
  this.lastGenerationDate = new Date();
  
  await this.save();
  
  return {
    used: this.generationsToday,
    total: this.totalGenerations,
    limit: this.isPremium ? 'unlimited' : 10
  };
};

// Get usage stats
userUsageSchema.methods.getUsageStats = function() {
  const today = new Date().toDateString();
  const lastGenDate = this.lastGenerationDate ? new Date(this.lastGenerationDate).toDateString() : null;
  
  // Reset counter if new day
  const dailyUsed = (lastGenDate === today) ? this.generationsToday : 0;
  
  const trialDaysLeft = this.isInFreeTrial() 
    ? Math.ceil((new Date(this.accountCreatedAt).getTime() + (90 * 24 * 60 * 60 * 1000) - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;
  
  return {
    totalGenerations: this.totalGenerations,
    dailyUsed,
    dailyLimit: this.isPremium ? 'unlimited' : 10,
    remaining: this.isPremium ? 'unlimited' : Math.max(0, 10 - dailyUsed),
    isPremium: this.isPremium,
    isInFreeTrial: this.isInFreeTrial(),
    trialDaysLeft,
    trialExpired: !this.isInFreeTrial() && !this.isPremium
  };
};

// Static: Get or create usage record
userUsageSchema.statics.getOrCreate = async function(userId) {
  let usage = await this.findOne({ userId });
  
  if (!usage) {
    usage = await this.create({
      userId,
      totalGenerations: 0,
      generationsToday: 0,
      accountCreatedAt: new Date(),
      isPremium: false
    });
  }
  
  return usage;
};

module.exports = mongoose.model('UserUsage', userUsageSchema);
