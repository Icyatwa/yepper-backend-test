// models/WalletModel.js
const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  ownerId: { 
    type: String, 
    required: true
  },
  ownerEmail: { 
    type: String, 
    required: true 
  },
  ownerType: {
    type: String,
    enum: ['webOwner', 'advertiser'],
    required: true
  },
  balance: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  totalEarned: { 
    type: Number, 
    default: 0 
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  totalRefunded: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound unique index instead of single field unique
walletSchema.index({ ownerId: 1, ownerType: 1 }, { unique: true });

const transactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true
  },
  adId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImportAd',
    required: true
  },
  relatedTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction',
    default: null // For linking refund transactions to original transactions
  },
  amount: { 
    type: Number, 
    required: true 
  },
  type: {
    type: String,
    enum: ['credit', 'debit', 'refund_credit', 'refund_debit'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  },
  transactionHash: {
    type: String,
    unique: true,
    sparse: true
  },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

const Wallet = mongoose.model('Wallet', walletSchema);
const WalletTransaction = mongoose.model('WalletTransaction', transactionSchema);

module.exports = { Wallet, WalletTransaction };