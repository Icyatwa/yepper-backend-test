// PaymentModel.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  tx_ref: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
  email: { type: String },
  phoneNumber: { type: String },
  userId: { type: String },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  webOwnerId: { type: String }, // New field for web owner
  withdrawn: { type: Boolean, default: false },
  paymentTrackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracker' }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
























// // models/PaymentModel.js
// const mongoose = require('mongoose');

// const paymentSchema = new mongoose.Schema({
//   tx_ref: { type: String, required: true, unique: true },
//   amount: { type: Number, required: true },
//   currency: { type: String, required: true },
//   status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
//   email: { type: String, required: false }, 
//   phoneNumber: { type: String, required: true },
//   userId: { type: String, required: true }, // ID of the user who paid
//   pictureId: { type: mongoose.Schema.Types.ObjectId, ref: 'Picture' },
//   withdrawalStatus: { type: String, enum: ['pending', 'completed', 'none'], default: 'none' }, // Track withdrawals
// }, { timestamps: true });

// module.exports = mongoose.model('Payment', paymentSchema);