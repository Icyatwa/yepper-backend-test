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
  createdAt: { type: Date, default: Date.now },
});

websiteSchema.index({ ownerId: 1 });
websiteSchema.index({ businessCategories: 1 });

module.exports = mongoose.model('Website', websiteSchema);