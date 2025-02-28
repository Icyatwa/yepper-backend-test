// // WebOwnerBalanceModel.js
// const mongoose = require('mongoose');

// const webOwnerBalanceSchema = new mongoose.Schema({
//   userId: { type: String, required: true, unique: true }, // The owner's unique identifier
//   totalEarnings: { type: Number, default: 0 }, // Cumulative earnings
//   availableBalance: { type: Number, default: 0 }, // Current balance available for withdrawal
// }, { timestamps: true });

// module.exports = mongoose.model('WebOwnerBalance', webOwnerBalanceSchema);

// WebOwnerBalanceModel.js
const mongoose = require('mongoose');

const webOwnerBalanceSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true,
    unique: true,
    validate: {
      validator: (v) => v?.trim() !== '',
      message: 'User ID cannot be null or empty',
    },
  },
  totalEarnings: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('WebOwnerBalance', webOwnerBalanceSchema);