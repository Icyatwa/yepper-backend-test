// models/RequestAdModel.js
const mongoose = require('mongoose');

const requestAdSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  imageUrl: { type: String },
  pdfUrl: { type: String },
  videoUrl: { type: String },
  categories: [{ type: String, required: true }],
  businessName: { type: String, required: true },
  businessWebsite: { type: String, required: true },
  businessLocation: { type: String, required: true },
  businessContacts: { type: String, required: true },
  adDescription: { type: String, required: true },
});

module.exports = mongoose.model('RequestAd', requestAdSchema);
