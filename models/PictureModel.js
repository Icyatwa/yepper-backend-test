// // PictureModel.js
// const mongoose = require('mongoose');

// const pictureSchema = new mongoose.Schema({
//   url: { type: String, required: true },
//   price: { type: Number, required: true },
//   ownerId: { type: String, required: true },
//   viewCount: { type: Number, default: 0 },
//   paidUsers: [{ type: String }], // Array of user IDs who have paid
// }, { timestamps: true });

// module.exports = mongoose.model('Picture', pictureSchema);




















// PictureModel.js
const mongoose = require('mongoose');

const pictureSchema = new mongoose.Schema({
  url: { type: String, required: true },
  price: { type: Number, required: true },
  ownerId: { type: String, required: true },
  viewCount: { type: Number, default: 0 }, 
  paidUsers: [{ type: String }], // Array of user IDs who have paid
}, { timestamps: true });

module.exports = mongoose.model('Picture', pictureSchema);
