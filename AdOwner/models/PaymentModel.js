// PaymentModel.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  tx_ref: { type: String, required: true, unique: true },
  baseReference: { type: String }, // NEW: For grouping related payments (hybrid/batch payments)
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  advertiserId: { type: String, required: true },
  webOwnerId: { type: String, required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory', required: true },
  amount: { type: Number, required: true }, // Full amount (original price)
  currency: { type: String, default: 'USD' },
  status: { 
    type: String, 
    enum: ['pending', 'successful', 'failed', 'cancelled', 'refunded', 'internally_refunded'], 
    default: 'pending'
  },
  flutterwaveData: { type: Map, of: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
  
  // REFUND FIELDS
  refundedAt: { type: Date },
  refundReason: { type: String },

  // ENHANCED: Better refund processing tracking
  internalRefundProcessed: {
    type: Boolean,
    default: false
  },
  refundTransactionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction'
  }],
  
  // REFUND APPLICATION FIELDS (for when refunds are used for new payments)
  refundApplied: { type: Number, default: 0 }, // Amount of refund applied to this payment
  
  // NEW: WALLET APPLICATION FIELDS (for when wallet balance is used)
  walletApplied: { type: Number, default: 0 }, // Amount of wallet balance applied to this payment
  
  amountPaid: { type: Number }, // Actual amount paid via external payment (Flutterwave)
  paymentMethod: { 
    type: String, 
    enum: ['flutterwave', 'refund_only', 'wallet_only', 'hybrid', 'wallet_hybrid', 'refund_hybrid'], 
    default: 'flutterwave' 
  },
  
  // NEW: REASSIGNMENT TRACKING
  isReassignment: { type: Boolean, default: false }, // Whether this payment is for ad reassignment
  
  // ENHANCED: FIFO refund usage tracking
  refundUsed: { type: Boolean, default: false }, // Whether this refund has been used
  refundUsedAt: { type: Date }, // When the refund was used
  refundUsedForPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }, // Which payment used this refund
  refundUsageAmount: { type: Number, default: 0 }, // How much of this refund was used (for partial usage)
  
  // ENHANCED: Refund source tracking (for payments that used refunds)
  refundSources: [{
    sourcePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    amountUsed: { type: Number },
    usedAt: { type: Date }
  }],
  
  // NEW: Wallet source tracking (for payments that used wallet balance)
  walletSources: [{
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    amountUsed: { type: Number },
    usedAt: { type: Date }
  }],
  
  // ADDITIONAL METADATA
  notes: { type: String }, // Admin notes or special circumstances
  originalPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }, // If this is a replacement payment
  metadata: { type: Map, of: mongoose.Schema.Types.Mixed }, // NEW: For storing additional data
  
  // ENHANCED: Rejection tracking
  rejectionDeadline: { type: Date }, // When the web owner can no longer reject this ad
  isRejectable: { type: Boolean, default: true }, // Whether this payment can still be rejected
});

// ENHANCED: Improved indexes for better query performance
paymentSchema.index({ adId: 1, status: 1 });
paymentSchema.index({ advertiserId: 1, status: 1 });
paymentSchema.index({ webOwnerId: 1, status: 1 });
paymentSchema.index({ status: 1, refundUsed: 1 });
paymentSchema.index({ advertiserId: 1, status: 1, refundUsed: 1 }); // For refund queries
paymentSchema.index({ advertiserId: 1, isReassignment: 1 }); // For reassignment queries
paymentSchema.index({ baseReference: 1 }); // NEW: For grouping related payments
paymentSchema.index({ createdAt: -1 }); // For chronological queries
paymentSchema.index({ refundedAt: 1, refundUsed: 1 }); // For FIFO refund selection

// Virtual to calculate effective payment amount
paymentSchema.virtual('effectiveAmount').get(function() {
  return this.amount - (this.refundApplied || 0) - (this.walletApplied || 0);
});

// NEW: Static method to find payments by base reference
paymentSchema.statics.findByBaseReference = async function(baseReference) {
  return await this.find({
    baseReference: baseReference
  }).sort({ createdAt: 1 });
};

// NEW: Static method to update all payments in a group
paymentSchema.statics.updatePaymentGroup = async function(baseReference, updateData, session = null) {
  return await this.updateMany(
    { baseReference: baseReference },
    updateData,
    { session }
  );
};

// ENHANCED: Get all available refunds for a user with FIFO ordering (unchanged)
paymentSchema.statics.getAllAvailableRefunds = async function(advertiserId) {
  const refundedPayments = await this.find({
    advertiserId: advertiserId,
    status: { $in: ['refunded', 'internally_refunded'] },
    refundUsed: { $ne: true }
  }).sort({ refundedAt: 1 }); // FIFO - oldest first
  
  return refundedPayments.reduce((total, payment) => total + payment.amount, 0);
};

// NEW: Get all payments made through reassignment
paymentSchema.statics.getReassignmentPayments = async function(advertiserId) {
  return await this.find({
    advertiserId: advertiserId,
    isReassignment: true
  }).sort({ createdAt: -1 });
};

// NEW: Get payment method breakdown for a user
paymentSchema.statics.getPaymentMethodBreakdown = async function(advertiserId) {
  const payments = await this.find({
    advertiserId: advertiserId,
    status: 'successful'
  });
  
  const breakdown = {
    total: payments.length,
    totalAmount: 0,
    methods: {
      flutterwave: 0,
      wallet_only: 0,
      refund_only: 0,
      wallet_hybrid: 0,
      refund_hybrid: 0,
      hybrid: 0
    },
    reassignments: {
      count: 0,
      amount: 0
    }
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

// ENHANCED: Get available refund with detailed breakdown (unchanged but added reassignment exclusion note)
paymentSchema.statics.getRefundBreakdown = async function(advertiserId) {
  const refundedPayments = await this.find({
    advertiserId: advertiserId,
    status: { $in: ['refunded', 'internally_refunded'] },
    refundUsed: { $ne: true }
  }).sort({ refundedAt: 1 }).populate('adId', 'businessName');
  
  const totalAmount = refundedPayments.reduce((total, payment) => total + payment.amount, 0);
  
  return {
    totalAmount,
    count: refundedPayments.length,
    note: "Refunds can only be used for new ad placements, NOT for ad reassignments.",
    reassignmentNote: "For ad reassignments, only wallet balance and card payments are accepted.",
    refunds: refundedPayments.map(payment => ({
      paymentId: payment._id,
      amount: payment.amount,
      refundedAt: payment.refundedAt,
      reason: payment.refundReason,
      businessName: payment.adId?.businessName || 'Unknown Business',
      status: payment.status,
      canUseForReassignment: false, // Always false as per business rule
      canUseForNewAd: true
    }))
  };
};

// ENHANCED: Smart refund application with FIFO logic (unchanged)
paymentSchema.statics.applyRefundsToPayment = async function(advertiserId, requiredAmount, session = null, isReassignment = false) {
  // FIXED: Block refund application for reassignment
  if (isReassignment) {
    return {
      totalRefundApplied: 0,
      remainingAmount: requiredAmount,
      appliedRefunds: [],
      refundsToUpdate: [],
      note: 'Refunds blocked for reassignment - use wallet/card only'
    };
  }
  
  // Original logic for new ads
  const availableRefunds = await this.find({
    advertiserId: advertiserId,
    status: { $in: ['refunded', 'internally_refunded'] },
    refundUsed: { $ne: true }
  }).sort({ refundedAt: 1 }).session(session); // FIFO
  
  let remainingAmount = requiredAmount;
  const appliedRefunds = [];
  const refundsToUpdate = [];
  
  for (const refundPayment of availableRefunds) {
    if (remainingAmount <= 0) break;
    
    const refundToUse = Math.min(remainingAmount, refundPayment.amount);
    
    appliedRefunds.push({
      sourcePaymentId: refundPayment._id,
      amountUsed: refundToUse,
      usedAt: new Date()
    });
    
    refundsToUpdate.push({
      paymentId: refundPayment._id,
      refundToUse: refundToUse
    });
    
    remainingAmount -= refundToUse;
  }
  
  const totalRefundApplied = requiredAmount - remainingAmount;
  
  return {
    totalRefundApplied,
    remainingAmount,
    appliedRefunds,
    refundsToUpdate
  };
};

// ENHANCED: Instance method to apply optimal refund amount (modified to check reassignment)
paymentSchema.methods.applyOptimalRefund = async function(availableRefundAmount, isReassignment = false) {
  // FIXED: Completely prevent refund application for reassignment
  if (isReassignment) {
    this.refundApplied = 0;
    this.walletApplied = 0; // This will be set separately for wallet payments
    this.amountPaid = this.amount;
    this.paymentMethod = 'flutterwave';
    
    return {
      refundApplied: 0,
      walletApplied: 0,
      amountPaid: this.amountPaid,
      paymentMethod: this.paymentMethod,
      note: 'Refunds not allowed for reassignment - wallet and card only'
    };
  }
  
  // Original logic for NEW ads only
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

// NEW: Instance method to apply wallet balance
paymentSchema.methods.applyWalletBalance = async function(availableWalletAmount, isReassignment = false) {
  const walletToApply = Math.min(availableWalletAmount, this.amount);
  
  this.walletApplied = walletToApply;
  this.amountPaid = Math.max(0, this.amount - walletToApply);
  this.isReassignment = isReassignment;
  
  // FIXED: Ensure refunds are never applied for reassignment
  if (isReassignment) {
    this.refundApplied = 0; // Force to 0 for reassignment
  }
  
  if (this.amountPaid === 0) {
    this.paymentMethod = 'wallet_only';
  } else if (walletToApply > 0) {
    this.paymentMethod = 'wallet_hybrid';
  }
  
  return {
    walletApplied: walletToApply,
    amountPaid: this.amountPaid,
    paymentMethod: this.paymentMethod,
    isReassignment: isReassignment,
    note: isReassignment ? 'Reassignment payment - refunds blocked' : null
  };
};

// Pre-save middleware to set payment method and rejection deadline
paymentSchema.pre('save', function(next) {
  // FIXED: Force refund fields to 0 for reassignment
  if (this.isReassignment) {
    this.refundApplied = 0;
    // Don't set refundUsed or related fields for reassignment payments
  }
  
  // Set payment method based on refund/wallet application
  if (this.isNew) {
    if (this.isReassignment) {
      // For reassignment: Only wallet or card methods
      if (this.walletApplied > 0) {
        if (this.amountPaid === 0) {
          this.paymentMethod = 'wallet_only';
        } else {
          this.paymentMethod = 'wallet_hybrid';
        }
      } else {
        this.paymentMethod = 'flutterwave';
      }
    } else {
      // Original logic for new ads
      if (this.walletApplied > 0 && this.refundApplied > 0) {
        this.paymentMethod = 'hybrid';
      } else if (this.walletApplied > 0) {
        if (this.amountPaid === 0) {
          this.paymentMethod = 'wallet_only';
        } else {
          this.paymentMethod = 'wallet_hybrid';
        }
      } else if (this.refundApplied > 0) {
        if (this.amountPaid === 0) {
          this.paymentMethod = 'refund_only';
        } else {
          this.paymentMethod = 'refund_hybrid';
        }
      }
    }
  }
  
  // Set rejection deadline for successful payments (2 minutes from payment)
  if (this.isModified('status') && this.status === 'successful' && this.paidAt) {
    this.rejectionDeadline = new Date(this.paidAt.getTime() + (2 * 60 * 1000)); // 2 minutes
    this.isRejectable = true;
  }
  
  // Mark as non-rejectable if deadline passed
  if (this.rejectionDeadline && new Date() > this.rejectionDeadline) {
    this.isRejectable = false;
  }
  
  next();
});

// ENHANCED: Instance method to create refund with proper tracking
paymentSchema.methods.createRefund = function(reason = 'Ad rejected by web owner', refundType = 'refunded') {
  this.status = refundType; // 'refunded' or 'internally_refunded'
  this.refundedAt = new Date();
  this.refundReason = reason;
  this.refundUsed = false;
  this.isRejectable = false; // Can't reject again after refund
  
  return this;
};

// ENHANCED: Instance method to check if payment can be rejected
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

// NEW: Instance method to check if payment is eligible for refund usage
paymentSchema.methods.canUseRefunds = function() {
  if (this.isReassignment) {
    return { 
      canUse: false, 
      reason: 'Refunds cannot be used for ad reassignments. Only wallet balance and card payments are allowed.',
      allowedMethods: ['wallet', 'card'],
      blockedMethods: ['refund']
    };
  }
  
  return { 
    canUse: true, 
    reason: null,
    allowedMethods: ['wallet', 'refund', 'card']
  };
};

// NEW: Get payment summary with restrictions
paymentSchema.methods.getPaymentSummary = function() {
  const refundRestriction = this.isReassignment ? 'No refunds allowed for reassignments' : 'All payment methods available';
  
  return {
    paymentId: this._id,
    amount: this.amount,
    walletApplied: this.walletApplied || 0,
    refundApplied: this.isReassignment ? 0 : (this.refundApplied || 0), // Force 0 for reassignment
    amountPaid: this.amountPaid || 0,
    paymentMethod: this.paymentMethod,
    isReassignment: this.isReassignment || false,
    restrictions: refundRestriction,
    allowedPaymentMethods: this.isReassignment ? ['wallet', 'card'] : ['wallet', 'refund', 'card'],
    baseReference: this.baseReference,
    createdAt: this.createdAt,
    paidAt: this.paidAt
  };
};

// ENHANCED: Static method to cleanup expired rejection deadlines
paymentSchema.statics.updateExpiredRejectionDeadlines = async function() {
  const now = new Date();
  const result = await this.updateMany(
    {
      rejectionDeadline: { $lt: now },
      isRejectable: true,
      status: 'successful'
    },
    {
      $set: { isRejectable: false }
    }
  );
  
  return result;
};

// NEW: Static method to get reassignment statistics
paymentSchema.statics.getReassignmentStats = async function(advertiserId) {
  const stats = await this.aggregate([
    {
      $match: {
        advertiserId: advertiserId,
        status: 'successful'
      }
    },
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
      result.reassignments = {
        count: stat.count,
        totalAmount: stat.totalAmount,
        walletUsed: stat.walletUsed,
        refundUsed: 0 // FORCE 0 for reassignments in stats
      };
    } else {
      result.newAds = {
        count: stat.count,
        totalAmount: stat.totalAmount,
        walletUsed: stat.walletUsed,
        refundUsed: stat.refundUsed
      };
    }
  });
  
  // Add validation note
  result.note = "Reassignments should never have refund usage - this is enforced at the application level";
  result.validationPassed = result.reassignments.refundUsed === 0;
  
  return result;
};

module.exports = mongoose.model('Payment', paymentSchema);
