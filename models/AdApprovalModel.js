// AdApprovalModel.js
const mongoose = require('mongoose');

const adApprovalSchema = new mongoose.Schema({
  adId: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

adApprovalSchema.index({ adId: 1, websiteId: 1 }, { unique: true });
module.exports = mongoose.model('AdApproval', adApprovalSchema);
