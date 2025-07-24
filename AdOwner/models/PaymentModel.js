// PaymentModel.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    tx_ref: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
    email: { type: String },
    cardDetails: {
        last4Digits: { type: String },
        issuer: { type: String },
        cardType: { type: String }
    },
    userId: { type: String },
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
    webOwnerId: { type: String },
    withdrawn: { type: Boolean, default: false },
    paymentTrackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracker' },
    testMode: { type: Boolean, default: false },
    processedAt: { type: Date },
    failureReason: { type: String }
}, { timestamps: true });

// Check if model already exists to prevent OverwriteModelError
module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);