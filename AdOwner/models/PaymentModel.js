// PaymentModel.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  tx_ref: { type: String, required: true, unique: true },
  baseReference: { type: String }, // For grouping related payments (hybrid/batch payments)
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  advertiserId: { type: String, required: true },
  webOwnerId: { type: String, required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory', required: true },
  amount: { type: Number, required: true }, // Full amount (original price)
  currency: { type: String, default: 'RWF' }, // FIX: default was 'USD', now 'RWF'
  status: { 
    type: String, 
    enum: ['pending', 'successful', 'failed', 'cancelled', 'refunded', 'internally_refunded'], 
    default: 'pending'
  },
  // FIX: renamed from flutterwaveData → xentriPayData to match the controller
  xentriPayData: { type: Map, of: mongoose.Schema.Types.Mixed },
  // Keep flutterwaveData as a legacy alias so old records aren't broken
  flutterwaveData: { type: Map, of: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
  
  // REFUND FIELDS
  refundedAt: { type: Date },
  refundReason: { type: String },

  internalRefundProcessed: {
    type: Boolean,
    default: false
  },
  refundTransactionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction'
  }],
  
  refundApplied: { type: Number, default: 0 },
  walletApplied: { type: Number, default: 0 },
  
  amountPaid: { type: Number },
  // FIX: added 'xentripay' to enum; kept all old values for backwards compat
  paymentMethod: { 
    type: String, 
    enum: [
      'xentripay',          // NEW — standard XentriPay card payment
      'flutterwave',        // legacy alias (same as xentripay)
      'refund_only',
      'wallet_only',
      'hybrid',
      'wallet_hybrid',
      'refund_hybrid',
    ], 
    default: 'xentripay'   // FIX: was 'flutterwave'
  },
  
  // paymentType is used by handleProcessWallet
  paymentType: {
    type: String,
    enum: [
      'xentripay',
      'flutterwave',
      'wallet',
      'wallet_reassignment',
      'hybrid',
      'hybrid_reassignment',
      'refund_only',
      'wallet_only',
      'wallet_hybrid',
      'refund_hybrid',
    ]
  },
  
  isReassignment: { type: Boolean, default: false },
  
  refundUsed: { type: Boolean, default: false },
  refundUsedAt: { type: Date },
  refundUsedForPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  refundUsageAmount: { type: Number, default: 0 },
  
  refundSources: [{
    sourcePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    amountUsed: { type: Number },
    usedAt: { type: Date }
  }],
  
  walletSources: [{
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    amountUsed: { type: Number },
    usedAt: { type: Date }
  }],
  
  notes: { type: String },
  originalPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  metadata: { type: Map, of: mongoose.Schema.Types.Mixed },
  
  rejectionDeadline: { type: Date },
  isRejectable: { type: Boolean, default: true },
});

// Indexes
paymentSchema.index({ adId: 1, status: 1 });
paymentSchema.index({ advertiserId: 1, status: 1 });
paymentSchema.index({ webOwnerId: 1, status: 1 });
paymentSchema.index({ status: 1, refundUsed: 1 });
paymentSchema.index({ advertiserId: 1, status: 1, refundUsed: 1 });
paymentSchema.index({ advertiserId: 1, isReassignment: 1 });
paymentSchema.index({ baseReference: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ refundedAt: 1, refundUsed: 1 });

paymentSchema.virtual('effectiveAmount').get(function() {
  return this.amount - (this.refundApplied || 0) - (this.walletApplied || 0);
});

paymentSchema.statics.findByBaseReference = async function(baseReference) {
  return await this.find({ baseReference }).sort({ createdAt: 1 });
};

paymentSchema.statics.updatePaymentGroup = async function(baseReference, updateData, session = null) {
  return await this.updateMany({ baseReference }, updateData, { session });
};

paymentSchema.statics.getAllAvailableRefunds = async function(advertiserId) {
  const refundedPayments = await this.find({
    advertiserId,
    status: { $in: ['refunded', 'internally_refunded'] },
    refundUsed: { $ne: true }
  }).sort({ refundedAt: 1 });
  
  return refundedPayments.reduce((total, payment) => total + payment.amount, 0);
};

paymentSchema.statics.getReassignmentPayments = async function(advertiserId) {
  return await this.find({ advertiserId, isReassignment: true }).sort({ createdAt: -1 });
};

paymentSchema.statics.getPaymentMethodBreakdown = async function(advertiserId) {
  const payments = await this.find({ advertiserId, status: 'successful' });
  
  const breakdown = {
    total: payments.length,
    totalAmount: 0,
    methods: {
      xentripay: 0,
      flutterwave: 0,
      wallet_only: 0,
      refund_only: 0,
      wallet_hybrid: 0,
      refund_hybrid: 0,
      hybrid: 0
    },
    reassignments: { count: 0, amount: 0 }
  };
  
  payments.forEach(payment => {
    breakdown.totalAmount += payment.amount;
    breakdown.methods[payment.paymentMethod] = (breakdown.methods[payment.paymentMethod] || 0) + 1;
    if (payment.isReassignment) {
      breakdown.reassignments.count += 1;
      breakdown.reassignments.amount += payment.amount;
    }
  });
  
  return breakdown;
};

paymentSchema.statics.getRefundBreakdown = async function(advertiserId) {
  const refundedPayments = await this.find({
    advertiserId,
    status: { $in: ['refunded', 'internally_refunded'] },
    refundUsed: { $ne: true }
  }).sort({ refundedAt: 1 }).populate('adId', 'businessName');
  
  const totalAmount = refundedPayments.reduce((total, p) => total + p.amount, 0);
  
  return {
    totalAmount,
    count: refundedPayments.length,
    note: 'Refunds can only be used for new ad placements, NOT for ad reassignments.',
    reassignmentNote: 'For ad reassignments, only wallet balance and card payments are accepted.',
    refunds: refundedPayments.map(payment => ({
      paymentId: payment._id,
      amount: payment.amount,
      refundedAt: payment.refundedAt,
      reason: payment.refundReason,
      businessName: payment.adId?.businessName || 'Unknown Business',
      status: payment.status,
      canUseForReassignment: false,
      canUseForNewAd: true
    }))
  };
};

paymentSchema.statics.applyRefundsToPayment = async function(advertiserId, requiredAmount, session = null, isReassignment = false) {
  if (isReassignment) {
    return {
      totalRefundApplied: 0,
      remainingAmount: requiredAmount,
      appliedRefunds: [],
      refundsToUpdate: [],
      note: 'Refunds blocked for reassignment - use wallet/card only'
    };
  }
  
  const availableRefunds = await this.find({
    advertiserId,
    status: { $in: ['refunded', 'internally_refunded'] },
    refundUsed: { $ne: true }
  }).sort({ refundedAt: 1 }).session(session);
  
  let remainingAmount = requiredAmount;
  const appliedRefunds = [];
  const refundsToUpdate = [];
  
  for (const refundPayment of availableRefunds) {
    if (remainingAmount <= 0) break;
    const refundToUse = Math.min(remainingAmount, refundPayment.amount);
    appliedRefunds.push({ sourcePaymentId: refundPayment._id, amountUsed: refundToUse, usedAt: new Date() });
    refundsToUpdate.push({ paymentId: refundPayment._id, refundToUse });
    remainingAmount -= refundToUse;
  }
  
  return {
    totalRefundApplied: requiredAmount - remainingAmount,
    remainingAmount,
    appliedRefunds,
    refundsToUpdate
  };
};

paymentSchema.methods.applyOptimalRefund = async function(availableRefundAmount, isReassignment = false) {
  if (isReassignment) {
    this.refundApplied = 0;
    this.walletApplied = 0;
    this.amountPaid = this.amount;
    this.paymentMethod = 'xentripay';
    return {
      refundApplied: 0,
      walletApplied: 0,
      amountPaid: this.amountPaid,
      paymentMethod: this.paymentMethod,
      note: 'Refunds not allowed for reassignment - wallet and card only'
    };
  }
  
  const refundToApply = Math.min(availableRefundAmount, this.amount);
  this.refundApplied = refundToApply;
  this.amountPaid = Math.max(0, this.amount - refundToApply);
  
  if (this.amountPaid === 0) {
    this.paymentMethod = 'refund_only';
  } else if (refundToApply > 0) {
    this.paymentMethod = 'hybrid';
  }
  
  return {
    refundApplied: refundToApply,
    amountPaid: this.amountPaid,
    paymentMethod: this.paymentMethod
  };
};

paymentSchema.methods.applyWalletBalance = async function(availableWalletAmount, isReassignment = false) {
  const walletToApply = Math.min(availableWalletAmount, this.amount);
  this.walletApplied = walletToApply;
  this.amountPaid = Math.max(0, this.amount - walletToApply);
  this.isReassignment = isReassignment;
  
  if (isReassignment) this.refundApplied = 0;
  
  if (this.amountPaid === 0) {
    this.paymentMethod = 'wallet_only';
  } else if (walletToApply > 0) {
    this.paymentMethod = 'wallet_hybrid';
  }
  
  return {
    walletApplied: walletToApply,
    amountPaid: this.amountPaid,
    paymentMethod: this.paymentMethod,
    isReassignment,
    note: isReassignment ? 'Reassignment payment - refunds blocked' : null
  };
};

// Pre-save middleware
paymentSchema.pre('save', function(next) {
  if (this.isReassignment) {
    this.refundApplied = 0;
  }
  
  if (this.isNew) {
    if (this.isReassignment) {
      if (this.walletApplied > 0) {
        this.paymentMethod = this.amountPaid === 0 ? 'wallet_only' : 'wallet_hybrid';
      } else {
        this.paymentMethod = 'xentripay';
      }
    } else {
      if (this.walletApplied > 0 && this.refundApplied > 0) {
        this.paymentMethod = 'hybrid';
      } else if (this.walletApplied > 0) {
        this.paymentMethod = this.amountPaid === 0 ? 'wallet_only' : 'wallet_hybrid';
      } else if (this.refundApplied > 0) {
        this.paymentMethod = this.amountPaid === 0 ? 'refund_only' : 'refund_hybrid';
      }
      // else: leave as default ('xentripay')
    }
  }
  
  if (this.isModified('status') && this.status === 'successful' && this.paidAt) {
    this.rejectionDeadline = new Date(this.paidAt.getTime() + (2 * 60 * 1000));
    this.isRejectable = true;
  }
  
  if (this.rejectionDeadline && new Date() > this.rejectionDeadline) {
    this.isRejectable = false;
  }
  
  next();
});

paymentSchema.methods.createRefund = function(reason = 'Ad rejected by web owner', refundType = 'refunded') {
  this.status = refundType;
  this.refundedAt = new Date();
  this.refundReason = reason;
  this.refundUsed = false;
  this.isRejectable = false;
  return this;
};

paymentSchema.methods.canBeRejected = function() {
  if (!this.isRejectable || this.status !== 'successful') {
    return { canReject: false, reason: 'Payment is not rejectable or not successful' };
  }
  if (this.rejectionDeadline && new Date() > this.rejectionDeadline) {
    return { canReject: false, reason: 'Rejection deadline has passed' };
  }
  if (this.internalRefundProcessed) {
    return { canReject: false, reason: 'Refund already processed' };
  }
  return { canReject: true, reason: null };
};

paymentSchema.methods.canUseRefunds = function() {
  if (this.isReassignment) {
    return {
      canUse: false,
      reason: 'Refunds cannot be used for ad reassignments. Only wallet balance and card payments are allowed.',
      allowedMethods: ['wallet', 'card'],
      blockedMethods: ['refund']
    };
  }
  return { canUse: true, reason: null, allowedMethods: ['wallet', 'refund', 'card'] };
};

paymentSchema.methods.getPaymentSummary = function() {
  return {
    paymentId: this._id,
    amount: this.amount,
    walletApplied: this.walletApplied || 0,
    refundApplied: this.isReassignment ? 0 : (this.refundApplied || 0),
    amountPaid: this.amountPaid || 0,
    paymentMethod: this.paymentMethod,
    isReassignment: this.isReassignment || false,
    restrictions: this.isReassignment ? 'No refunds allowed for reassignments' : 'All payment methods available',
    allowedPaymentMethods: this.isReassignment ? ['wallet', 'card'] : ['wallet', 'refund', 'card'],
    baseReference: this.baseReference,
    createdAt: this.createdAt,
    paidAt: this.paidAt
  };
};

paymentSchema.statics.updateExpiredRejectionDeadlines = async function() {
  return await this.updateMany(
    { rejectionDeadline: { $lt: new Date() }, isRejectable: true, status: 'successful' },
    { $set: { isRejectable: false } }
  );
};

paymentSchema.statics.getReassignmentStats = async function(advertiserId) {
  const stats = await this.aggregate([
    { $match: { advertiserId, status: 'successful' } },
    {
      $group: {
        _id: '$isReassignment',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        walletUsed: { $sum: { $ifNull: ['$walletApplied', 0] } },
        refundUsed: { $sum: { $ifNull: ['$refundApplied', 0] } }
      }
    }
  ]);
  
  const result = {
    newAds: { count: 0, totalAmount: 0, walletUsed: 0, refundUsed: 0 },
    reassignments: { count: 0, totalAmount: 0, walletUsed: 0, refundUsed: 0 }
  };
  
  stats.forEach(stat => {
    if (stat._id === true) {
      result.reassignments = { count: stat.count, totalAmount: stat.totalAmount, walletUsed: stat.walletUsed, refundUsed: 0 };
    } else {
      result.newAds = { count: stat.count, totalAmount: stat.totalAmount, walletUsed: stat.walletUsed, refundUsed: stat.refundUsed };
    }
  });
  
  result.note = 'Reassignments should never have refund usage - enforced at application level';
  result.validationPassed = result.reassignments.refundUsed === 0;
  
  return result;
};

module.exports = mongoose.model('Payment', paymentSchema);