// models/WithdrawalModel.js
const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  userEmail: {
    type: String,
    required: true
  },
  ownerType: {
    type: String,
    enum: ['webOwner', 'advertiser'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  bankDetails: {
    bankName: {
      type: String,
      required: true
    },
    accountNumber: {
      type: String,
      required: true
    },
    accountName: {
      type: String,
      required: true
    },
    country: {
      type: String,
      required: true
    },
    routingNumber: {
      type: String,
      required: false
    },
    swiftCode: {
      type: String,
      required: false
    }
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'completed', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  walletBalanceAtRequest: {
    type: Number,
    required: true
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  adminNotes: {
    type: String,
    default: ''
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction',
    default: null
  }
}, {
  timestamps: true
});

withdrawalRequestSchema.index({ createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });

const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

module.exports = WithdrawalRequest;