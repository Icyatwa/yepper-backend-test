// // models/WithdrawalModel.js
// const mongoose = require('mongoose');

// const withdrawalSchema = new mongoose.Schema({
//     userId: { type: String, required: true }, // User requesting the withdrawal
//     phoneNumber: { type: String, required: true }, 
//     amount: { type: Number, required: true },
//     beneficiaryName: { type: String, required: true },
//     status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' },
//   }, { timestamps: true });

// module.exports = mongoose.model('Withdrawal', withdrawalSchema);



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