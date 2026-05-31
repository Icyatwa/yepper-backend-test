// AdPromoter/jobs/expireGrantWindows.js
// Previously cleared grant display fields after 24 hours.
// Now grants stay active until the website's real traffic counting (via the
// Yepper script pings in analyticsController.trackPageView) reaches or surpasses
// the tier the owner was granted.  That handler sets grantedTrafficDisplay=null
// automatically, so no time-based job is needed.
//
// This file is kept as a no-op to avoid import errors in server.js.

async function expireGrantWindows() {
  // No-op: grant expiry is now handled in analyticsController.trackPageView
  // when real monthly traffic catches up to the granted tier.
}

module.exports = expireGrantWindows;
