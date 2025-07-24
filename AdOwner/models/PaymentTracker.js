// PaymentTracker.js
const mongoose = require('mongoose');

const paymentTrackerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory', required: true },
  paymentDate: { type: Date, required: true },
  lastWithdrawalDate: { type: Date },
  amount: { type: Number, required: true },
  viewsRequired: { type: Number, required: true },
  currentViews: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'available', 'withdrawn'],
    default: 'pending'
  },
  paymentReference: { type: String, unique: true, sparse: true },
  testMode: { type: Boolean, default: false }
}, { timestamps: true });

// Check if model already exists to prevent OverwriteModelError
module.exports = mongoose.models.PaymentTracker || mongoose.model('PaymentTracker', paymentTrackerSchema);