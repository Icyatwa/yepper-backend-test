// TemporaryAdData.js
const mongoose = require('mongoose');

const temporaryAdDataSchema = new mongoose.Schema({
  tx_ref: { type: String, required: true, unique: true },
  userId: String,
  businessName: String,
  businessLocation: String,
  adDescription: String,
  imageUrl: String,
  pdfUrl: String,
  videoUrl: String,
  templateType: String,
  categories: [String],
  amount: Number,
  currency: String,
  email: String,
  phoneNumber: String,
}, { timestamps: true });

const TemporaryAdData = mongoose.model('TemporaryAdData', temporaryAdDataSchema);

module.exports = TemporaryAdData;
