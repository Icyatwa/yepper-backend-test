// // PaymentModel.js
// const mongoose = require('mongoose');

// const paymentSchema = new mongoose.Schema({
//   tx_ref: { type: String, required: true, unique: true },
//   amount: { type: Number, required: true },
//   currency: { type: String, required: true },
//   status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
//   email: { type: String },
//   phoneNumber: { type: String },
//   userId: { type: String },
//   adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
//   webOwnerId: { type: String }, // New field for web owner
//   withdrawn: { type: Boolean, default: false },
//   paymentTrackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracker' }
// }, { timestamps: true });

// module.exports = mongoose.model('Payment', paymentSchema);






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
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true }, // Added this field
    webOwnerId: { type: String },
    withdrawn: { type: Boolean, default: false },
    paymentTrackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracker' }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);