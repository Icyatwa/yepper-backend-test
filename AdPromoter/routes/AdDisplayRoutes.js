// AdDisplayRoutes.js
const express = require('express');
const router = express.Router();
const adDisplayController = require('../controllers/AdDisplayController');
const AdScriptController  = require('../controllers/AdScriptController');
const SiteScriptController = require('../controllers/SiteScriptController');

// ── Original paths (kept for backward compatibility) ──────────────────────
router.get('/display', adDisplayController.displayAd);
router.get('/search', adDisplayController.searchAd);
router.get('/script/:scriptId', AdScriptController.serveAdScript);
router.get('/script/site/:websiteId', SiteScriptController.serveSiteScript);
router.post('/view/:adId', adDisplayController.incrementView);
router.post('/click/:adId', adDisplayController.incrementClick);

// ── Stealth aliases — neutral names that bypass filter-list pattern matching ──
// The generated scripts use /api/p/* instead of /api/ads/* to avoid blocklists.
router.get('/feed',            adDisplayController.displayAd);         // display
router.get('/feed/search',     adDisplayController.searchAd);          // search
router.get('/unit/:scriptId',  AdScriptController.serveAdScript);      // per-space script
router.get('/site/:websiteId', SiteScriptController.serveSiteScript);  // site-wide script
router.post('/ev/:adId',       adDisplayController.incrementView);     // view event
router.post('/ec/:adId',       adDisplayController.incrementClick);    // click event

module.exports = router;