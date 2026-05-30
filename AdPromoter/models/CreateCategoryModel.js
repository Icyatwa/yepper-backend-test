// CreateCategoryModel.js
const mongoose = require('mongoose');

const adCategorySchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  categoryName: { type: String, required: true, minlength: 3 },
  description: { type: String, maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  spaceType: { type: String, required: true },
  userCount: { type: Number, default: 0 },
  instructions: { type: String },
  defaultLanguage: { 
    type: String, 
    enum: ['english', 'french', 'kinyarwanda', 'kiswahili', 'chinese', 'spanish'],
    default: 'english' 
  },
  customAttributes: { type: Map, of: String },
  placementMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  placeholderDiv: { type: String, default: null },
  apiCodes: {
    HTML: { type: String },
    JavaScript: { type: String },
    PHP: { type: String },
    Python: { type: String },
    HTML_manual: { type: String },
    JavaScript_manual: { type: String },
    PHP_manual: { type: String },
    Python_manual: { type: String },
  },
  selectedAds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd' }],
  webOwnerEmail: { type: String, required: true },
  visitorRange: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  tier: {
    type: String,
    enum: ['starter', 'basic', 'standard', 'premium', 'elite', 'unverified'],
    required: true
  },
  customization: {
    type: Object,
    default: null
  },
  createdAt: { type: Date, default: Date.now }
});

adCategorySchema.index({ ownerId: 1, websiteId: 1, categoryName: 1 });

const AdCategory = mongoose.model('AdCategory', adCategorySchema);
module.exports = AdCategory;