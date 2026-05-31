// admin/models/TrafficGrantModel.js
const mongoose = require('mongoose');

const trafficGrantSchema = new mongoose.Schema({
  // Which user was granted this feature
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Which website this grant is for (null = user can pick any of their sites)
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', default: null },

  // The traffic number the user chose to inject
  grantedTraffic: { type: Number, default: null },
  grantedViews:   { type: Number, default: null },

  // One-time secure token embedded in the email link + dashboard button
  accessToken: { type: String, required: true, unique: true },
  tokenUsed:   { type: Boolean, default: false },
  tokenUsedAt: { type: Date,   default: null },

  // Admin who created the grant
  grantedBy: { type: String, required: true }, // admin username

  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired', 'revoked'],
    default: 'pending',
  },

  expiresAt: { type: Date, required: true },
  completedAt:         { type: Date, default: null },
  // 24-hour window after grant is applied — while active the button shows in dashboard
  grantWindowExpiresAt: { type: Date, default: null },

  // Email was sent?
  emailSent:   { type: Boolean, default: false },
  emailSentAt: { type: Date,   default: null },

  notes: { type: String, default: '' },
}, { timestamps: true });

trafficGrantSchema.index({ userId: 1 });
trafficGrantSchema.index({ accessToken: 1 });
trafficGrantSchema.index({ status: 1 });

module.exports = mongoose.model('TrafficGrant', trafficGrantSchema);
