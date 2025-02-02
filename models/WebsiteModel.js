// WebsiteModel.js
const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteName: { type: String, required: true },
  websiteLink: { type: String, required: true, unique: true },
  imageUrl: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
});

websiteSchema.index({ ownerId: 1 }); // Index for faster query by ownerId

module.exports = mongoose.model('Website', websiteSchema);