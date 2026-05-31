// AdPromoter/jobs/expireGrantWindows.js
// Runs every hour to clear expired grant display windows from website records.
// Once grantWindowExpiresAt passes, the "Stated Traffic" section hides itself
// automatically and the banner disappears.

const Website = require('../models/CreateWebsiteModel');

async function expireGrantWindows() {
  try {
    const result = await Website.updateMany(
      {
        grantWindowExpiresAt: { $lt: new Date() },
        $or: [
          { grantedTrafficDisplay: { $ne: null } },
          { grantedViewsDisplay:   { $ne: null } },
        ],
      },
      {
        $set: {
          grantWindowExpiresAt:  null,
          grantedTrafficDisplay: null,
          grantedViewsDisplay:   null,
          grantedTierDisplay:    null,
        },
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`[grantWindow] Cleared ${result.modifiedCount} expired grant window(s).`);
    }
  } catch (err) {
    console.error('[grantWindow] Error expiring grant windows:', err.message);
  }
}

// Run immediately on startup, then every hour
expireGrantWindows();
setInterval(expireGrantWindows, 60 * 60 * 1000);

module.exports = expireGrantWindows;
