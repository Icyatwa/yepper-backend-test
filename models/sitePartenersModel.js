// waitlist.js
const mongoose = require('mongoose');

const SitePartnersWaitlistSchema = new mongoose.Schema({
  email: { type: String, required: true },
});

module.exports = mongoose.model('SitePartnerWaitlist', SitePartnersWaitlistSchema);