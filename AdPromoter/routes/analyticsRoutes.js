// analyticsRoutes.js
const express    = require('express');
const router     = express.Router();
const analytics  = require('../controllers/analyticsController');
const gsc        = require('../controllers/searchConsoleController');

// Public — called by the injected script from any domain
router.options('/track', analytics.trackOptions);
router.post('/track', analytics.trackPageView);

// ── Google Search Console routes ─────────────────────────────────────────────
// IMPORTANT: these specific routes must come BEFORE the /:websiteId wildcard
// Returns the OAuth URL to redirect the user to
router.get('/gsc/connect/:websiteId', gsc.getConnectUrl);
// Google redirects here after user grants access
router.get('/gsc/callback', gsc.oauthCallback);
// Fetch GSC performance data for a website
router.get('/gsc/data/:websiteId', gsc.getGscData);
// Remove GSC connection
router.delete('/gsc/disconnect/:websiteId', gsc.disconnect);

// Protected — called by the dashboard (wildcard last to avoid catching gsc routes)
router.get('/:websiteId', analytics.getAnalytics);

module.exports = router;
