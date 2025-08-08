// PaymentModel.js - Enhanced with better refund tracking and FIFO logic
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  tx_ref: { type: String, required: true, unique: true },
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
  amountPaid: { type: Number }, // Actual amount paid via external payment (Flutterwave)
  paymentMethod: { 
    type: String, 
    enum: ['flutterwave', 'refund_only', 'hybrid'], 
    default: 'flutterwave' 
  },
  
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
  
  // ADDITIONAL METADATA
  notes: { type: String }, // Admin notes or special circumstances
  originalPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }, // If this is a replacement payment
  
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
paymentSchema.index({ createdAt: -1 }); // For chronological queries
paymentSchema.index({ refundedAt: 1, refundUsed: 1 }); // For FIFO refund selection

// Virtual to calculate effective payment amount
paymentSchema.virtual('effectiveAmount').get(function() {
  return this.amount - (this.refundApplied || 0);
});

// ENHANCED: Get all available refunds for a user with FIFO ordering
paymentSchema.statics.getAllAvailableRefunds = async function(advertiserId) {
  const refundedPayments = await this.find({
    advertiserId: advertiserId,
    status: { $in: ['refunded', 'internally_refunded'] },
    refundUsed: { $ne: true }
  }).sort({ refundedAt: 1 }); // FIFO - oldest first
  
  return refundedPayments.reduce((total, payment) => total + payment.amount, 0);
};

// ENHANCED: Get available refund with detailed breakdown
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
    refunds: refundedPayments.map(payment => ({
      paymentId: payment._id,
      amount: payment.amount,
      refundedAt: payment.refundedAt,
      reason: payment.refundReason,
      businessName: payment.adId?.businessName || 'Unknown Business',
      status: payment.status
    }))
  };
};

// ENHANCED: Smart refund application with FIFO logic
paymentSchema.statics.applyRefundsToPayment = async function(advertiserId, requiredAmount, session = null) {
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
    
    // Mark refund as used
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

// ENHANCED: Instance method to apply optimal refund amount
paymentSchema.methods.applyOptimalRefund = async function(availableRefundAmount) {
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

// Pre-save middleware to set payment method and rejection deadline
paymentSchema.pre('save', function(next) {
  // Set payment method based on refund application
  if (this.isNew && this.refundApplied > 0) {
    if (this.amountPaid === 0) {
      this.paymentMethod = 'refund_only';
    } else {
      this.paymentMethod = 'hybrid';
    }
  }
  
  // ENHANCED: Set rejection deadline for successful payments (2 minutes from payment)
  if (this.isModified('status') && this.status === 'successful' && this.paidAt) {
    this.rejectionDeadline = new Date(this.paidAt.getTime() + (2 * 60 * 1000)); // 2 minutes
    this.isRejectable = true;
  }
  
  // ENHANCED: Mark as non-rejectable if deadline passed
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

module.exports = mongoose.model('Payment', paymentSchema);
















// // PaymentModel.js
// const mongoose = require('mongoose');

// const paymentSchema = new mongoose.Schema({
//     tx_ref: { type: String, required: true, unique: true },
//     amount: { type: Number, required: true },
//     currency: { type: String, required: true },
//     status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
//     email: { type: String },
//     cardDetails: {
//         last4Digits: { type: String },
//         issuer: { type: String },
//         cardType: { type: String }
//     },
//     userId: { type: String },
//     adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
//     websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
//     webOwnerId: { type: String },
//     withdrawn: { type: Boolean, default: false },
//     paymentTrackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTracker' },
//     testMode: { type: Boolean, default: false },
//     processedAt: { type: Date },
//     failureReason: { type: String }
// }, { timestamps: true });

// // Check if model already exists to prevent OverwriteModelError
// module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);