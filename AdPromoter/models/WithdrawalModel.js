// WithdrawalModel.js
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  phoneNumber: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  transactionId: { type: String },
  failureReason: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);