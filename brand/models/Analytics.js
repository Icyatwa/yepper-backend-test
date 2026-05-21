// Analytics.js
const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform: { type: String, enum: ['instagram', 'youtube'], required: true },
  month: { type: String, required: true },
  snapshot: {
    followers: Number,
    followersGrowth: Number,
    totalPosts: Number,
    totalEngagements: Number,
    engagementRate: Number,
    likes: Number,
    comments: Number,
    saves: Number,
    shares: Number,
    reach: Number,
    impressions: Number,
    profileVisits: Number,
    storyViews: Number,
    subscribers: Number,
    subscribersGrowth: Number,
    views: Number,
    watchTimeMinutes: Number,
    avgViewDuration: Number,
    avgViewPercentage: Number,
    dislikes: Number,
    estimatedRevenue: Number,
    topContent: [{
      id: String,
      title: String,
      thumbnail: String,
      url: String,
      metric: Number,
      engagements: Number
    }]
  },
  aiInsights: {
    summary: String,
    strengths: [String],
    weaknesses: [String],
    recommendations: [String],
    focusAreas: [String],
    generatedAt: Date
  },
  fetchedAt: { type: Date, default: Date.now }
});

analyticsSchema.index({ userId: 1, platform: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Analytics', analyticsSchema);
