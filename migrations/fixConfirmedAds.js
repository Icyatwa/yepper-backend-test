/**
 * Migration: Fix ads stuck with confirmed:false despite having active/approved websiteSelections.
 * Run once: node migrations/fixConfirmedAds.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ImportAd = require('../AdOwner/models/WebAdvertiseModel');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const result = await ImportAd.updateMany(
    {
      confirmed: false,
      'websiteSelections': {
        $elemMatch: { approved: true, status: 'active' }
      }
    },
    { $set: { confirmed: true } }
  );

  console.log(`Fixed ${result.modifiedCount} ads (set confirmed:true where at least one selection is active+approved)`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
