// models/Campaign.js
const mongoose = require('mongoose');

const rateCardSelectionSchema = new mongoose.Schema({
  rateCardIndex: {
    type: Number,
    required: true
  },
  title: String,
  price: String,
  type: String,
  description: String,
  quantity: String,
  item: String,
  time: String,
  additionalInfo: String
}, { _id: false });

const platformSelectionSchema = new mongoose.Schema({
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
    required: true,
    enum: ['websites', 'tv', 'radio', 'billboards', 'influencers']
  },
  selectedRateCards: [rateCardSelectionSchema]
}, { _id: false });

const campaignSchema = new mongoose.Schema({
  campaignName: {
    type: String,
    required: true,
    trim: true
  },
  selectedPlatforms: [platformSelectionSchema],
  selectedCategories: {
    websites: { type: Boolean, default: false },
    tv: { type: Boolean, default: false },
    radio: { type: Boolean, default: false },
    billboards: { type: Boolean, default: false },
    influencers: { type: Boolean, default: false }
  },
  totalCost: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed'],
    default: 'draft'
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster queries
campaignSchema.index({ createdAt: -1 });
campaignSchema.index({ status: 1 });

// Virtual for platform count
campaignSchema.virtual('platformCount').get(function() {
  return this.selectedPlatforms.length;
});

// Virtual for category count
campaignSchema.virtual('categoryCount').get(function() {
  return Object.values(this.selectedCategories).filter(Boolean).length;
});

// Method to calculate total cost
campaignSchema.methods.calculateTotalCost = function() {
  return this.totalCost;
};

// Pre-save hook to ensure data integrity
campaignSchema.pre('save', function(next) {
  if (!Array.isArray(this.selectedPlatforms)) {
    this.selectedPlatforms = [];
  }
  next();
});

const Campaigns = mongoose.model('Campaign', campaignSchema);

module.exports = Campaigns;