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
  trafficTier: { type: String, enum: ['unverified','starter','basic','standard','premium','elite'], default: 'unverified' },
  siteScript: { type: String, default: null },
  verificationToken: { type: String, default: null },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed'],
    default: 'pending',
  },
  verifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },

  // Google Search Console integration
  gscAccessToken:  { type: String, default: null },
  gscRefreshToken: { type: String, default: null },
  gscSiteUrl:      { type: String, default: null },  // matched GSC property URL
  gscConnectedAt:  { type: Date,   default: null },

  // Script installation & GSC verification tracking
  scriptInstalled:  { type: Boolean, default: false },   // true once the Yepper script sends its first ping
  scriptInstalledAt:{ type: Date,    default: null },
  gscVerified:      { type: Boolean, default: false },   // true when site is found in GSC
  gscVerifiedAt:    { type: Date,    default: null },
  unverifiedSince:  { type: Date,    default: null },    // when scriptInstalled became true but gscVerified is false
});

websiteSchema.index({ ownerId: 1 });
websiteSchema.index({ businessCategories: 1 });

module.exports = mongoose.model('Website', websiteSchema);