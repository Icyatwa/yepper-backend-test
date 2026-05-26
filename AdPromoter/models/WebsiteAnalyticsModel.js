// WebsiteAnalyticsModel.js
const mongoose = require('mongoose');

const pageViewSchema = new mongoose.Schema({
  websiteId:  { type: String, required: true, index: true },
  ip:         { type: String, default: '' },
  country:    { type: String, default: 'Unknown' },
  countryCode:{ type: String, default: '' },
  city:       { type: String, default: 'Unknown' },
  region:     { type: String, default: '' },
  lat:        { type: Number, default: null },
  lon:        { type: Number, default: null },
  device:     { type: String, enum: ['desktop', 'mobile', 'tablet', 'bot', 'unknown'], default: 'unknown' },
  referrer:   { type: String, default: '' },
  path:       { type: String, default: '/' },
  timestamp:  { type: Date, default: Date.now, index: true },
});

// Compound index for fast per-website time-range queries
pageViewSchema.index({ websiteId: 1, timestamp: -1 });
pageViewSchema.index({ websiteId: 1, country: 1 });

module.exports = mongoose.model('WebsitePageView', pageViewSchema);