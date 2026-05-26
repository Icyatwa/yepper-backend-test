// analyticsRoutes.js
const express    = require('express');
const router     = express.Router();
const analytics  = require('../controllers/analyticsController');

// Public — called by the injected script from any domain
router.options('/track', analytics.trackOptions);
router.post('/track', analytics.trackPageView);

// Protected — called by the dashboard
router.get('/:websiteId', analytics.getAnalytics);

module.exports = router;