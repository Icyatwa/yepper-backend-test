// // AdSpaceModel.js
// const mongoose = require('mongoose');

// const adSpaceSchema = new mongoose.Schema({
//   categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory', required: true },
//   spaceType: { type: String, required: true },
//   price: { type: Number, required: true, min: 0 },
//   availability: { type: String, required: true },
//   startDate: { type: Date, default: null },
//   endDate: { type: Date, default: null },
//   userCount: { type: Number, default: 0 },
//   instructions: { type: String },
//   apiCodes: {
//     HTML: { type: String },
//     JavaScript: { type: String },
//     PHP: { type: String },
//     Python: { type: String },
//   },
//   selectedAds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd' }],
//   createdAt: { type: Date, default: Date.now },
//   webOwnerEmail: { type: String, required: true },
// });

// adSpaceSchema.virtual('remainingUserCount').get(function () {
//   return this.userCount - this.selectedAds.length;
// });

// adSpaceSchema.pre('validate', function (next) {
//   if (
//     (this.availability === 'Reserved for future date' || this.availability === 'Pick a date') &&
//     (!this.startDate || !this.endDate)
//   ) {
//     return next(new Error('Start date and end date must be provided for reserved or future availability.'));
//   }
//   next();
// });

// adSpaceSchema.index({ categoryId: 1 }); // Index for faster lookups

// adSpaceSchema.virtual('remainingUserCount').get(function() {
//   return this.userCount - this.selectedAds.length;
// });

// adSpaceSchema.set('toJSON', { virtuals: true });

// module.exports = mongoose.model('AdSpace', adSpaceSchema);

const mongoose = require('mongoose');

const adSpaceSchema = new mongoose.Schema({
  webOwnerId: { type: String, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory', required: true },
  spaceType: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  availability: { type: String, required: true },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  userCount: { type: Number, default: 0 },
  instructions: { type: String },
  apiCodes: {
    HTML: { type: String },
    JavaScript: { type: String },
    PHP: { type: String },
    Python: { type: String },
  },
  selectedAds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd', default: [] }],
  createdAt: { type: Date, default: Date.now },
  webOwnerEmail: { type: String, required: true },
});

// Update virtual property to handle undefined `selectedAds` array
adSpaceSchema.virtual('remainingUserCount').get(function () {
  return this.userCount - (this.selectedAds ? this.selectedAds.length : 0);
});

adSpaceSchema.pre('validate', function (next) {
  if (
    (this.availability === 'Reserved for future date' || this.availability === 'Pick a date') &&
    (!this.startDate || !this.endDate)
  ) {
    return next(new Error('Start date and end date must be provided for reserved or future availability.'));
  }
  next();
});

adSpaceSchema.index({ categoryId: 1 }); // Index for faster lookups
adSpaceSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('AdSpace', adSpaceSchema);