// PaymentModel.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  tx_ref: { type: String, required: true, unique: true },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  advertiserId: { type: String, required: true },
  webOwnerId: { type: String, required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  status: { 
    type: String, 
    enum: ['pending', 'successful', 'failed', 'cancelled', 'refunded'], // ADD 'refunded'
    default: 'pending'
  },
  flutterwaveData: { type: Map, of: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
  // ADD THESE NEW FIELDS:
  refundedAt: { type: Date },
  refundReason: { type: String }
});

module.exports = mongoose.model('Payment', paymentSchema);
















// // PaymentModel.js
// const mongoose = require('mongoose');

// const paymentSchema = new mongoose.Schema({
//     tx_ref: { type: String, required: true, unique: true },
//     amount: { type: Number, required: true },
//     currency: { type: String, required: true },
//     status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
//     email: { type: String },
//     cardDetails: {
//         last4Digits: { type: String },
//         issuer: { type: String },
//         cardType: { type: String }
//     },
//     userId: { type: String },
//     adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
//     websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
//     webOwnerId: { type: String },
//     withdrawn: { type: Boolean, default: false },
//     paymentTrackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracker' },
//     testMode: { type: Boolean, default: false },
//     processedAt: { type: Date },
//     failureReason: { type: String }
// }, { timestamps: true });

// // Check if model already exists to prevent OverwriteModelError
// module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);