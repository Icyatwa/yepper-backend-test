// // ImportAdModel.js
// const mongoose = require('mongoose');
// const importAdSchema = new mongoose.Schema({
//   userId: { type: String, required: true, index: true },
//   adOwnerEmail: { type: String, required: true },
//   imageUrl: { type: String },
//   pdfUrl: { type: String },
//   videoUrl: { type: String },
//   businessName: { type: String, required: true },
//   businessLink: { type: String, required: true },
//   businessLocation: { type: String, required: true },
//   adDescription: { type: String, required: true },
//   selectedWebsites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Website' }],
//   selectedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory' }],
//   approved: { type: Boolean, default: false },
//   confirmed: { type: Boolean, default: false },
//   clicks: { type: Number, default: 0 },
//   views: { type: Number, default: 0 },
// });

// module.exports = mongoose.model('ImportAd', importAdSchema);

// ImportAdModel.js
const mongoose = require('mongoose');

const importAdSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  adOwnerEmail: { type: String, required: true },
  imageUrl: { type: String },
  pdfUrl: { type: String },
  videoUrl: { type: String },
  businessName: { type: String, required: true },
  businessLink: { type: String, required: true },
  businessLocation: { type: String, required: true },
  adDescription: { type: String, required: true },
  websiteSelections: [{
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory' }],
    approved: { type: Boolean, default: false },
    approvedAt: { type: Date }
  }],
  confirmed: { type: Boolean, default: false },
  clicks: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

importAdSchema.index({ userId: 1, 'websiteSelections.websiteId': 1 });

module.exports = mongoose.model('ImportAd', importAdSchema);