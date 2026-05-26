// CreateWebsiteModel.js
const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteName: { type: String, required: true },
  websiteLink: { type: String, required: true, unique: true },
  imageUrl: { type: String },
  businessCategories: {
    type: [String],
    enum: [
      'any',
      'technology',
      'food-beverage',
      'real-estate',
      'automotive',
      'health-wellness',
      'entertainment',
      'fashion',
      'education',
      'business-services',
      'travel-tourism',
      'arts-culture',
      'photography',
      'gifts-events',
      'government-public',
      'general-retail'
    ],
    default: []
  },
  isBusinessCategoriesSelected: { type: Boolean, default: false },
  monthlyTraffic: { type: Number, default: 0 },
  trafficTier: { type: String, enum: ['starter','basic','standard','premium','elite'], default: 'starter' },
  siteScript: { type: String, default: null },
  verificationToken: { type: String, default: null },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed'],
    default: 'pending',
  },
  verifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

websiteSchema.index({ ownerId: 1 });
websiteSchema.index({ businessCategories: 1 });

module.exports = mongoose.model('Website', websiteSchema);