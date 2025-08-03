// models/WalletModel.js
const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, unique: true },
  ownerEmail: { type: String, required: true },
  balance: { type: Number, default: 0, min: 0 },
  totalEarned: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
  walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], default: 'credit' },
  description: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Wallet = mongoose.model('Wallet', walletSchema);
const WalletTransaction = mongoose.model('WalletTransaction', transactionSchema);

module.exports = { Wallet, WalletTransaction };