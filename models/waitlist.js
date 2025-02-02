// waitlist.js
const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
  email: { type: String, required: true },
});

module.exports = mongoose.model('Waitlist', waitlistSchema);