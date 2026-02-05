// models/Campaign.js - Add userId field
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long']
  },
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    minlength: [2, 'Business name must be at least 2 characters long']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  selectedChannels: [{
    type: String,
    enum: ['websites', 'tv', 'radio', 'billboards', 'influencers'],
    required: true
  }],
  selectedPlatforms: [{
    platformId: {
      type: String,
      required: true
    },
    platformName: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: ['websites', 'tv', 'radio', 'billboards', 'influencers'],
      required: true
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'contacted', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});

campaignSchema.index({ userId: 1 });
campaignSchema.index({ phoneNumber: 1 });
campaignSchema.index({ status: 1 });
campaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Campaign', campaignSchema);
