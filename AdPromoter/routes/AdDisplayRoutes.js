// AdDisplayRoutes.js
const express = require('express');
const router = express.Router();
const adDisplayController = require('../controllers/AdDisplayController');
const AdScriptController = require('../controllers/AdScriptController');

router.get('/display', adDisplayController.displayAd);
router.get('/search', adDisplayController.searchAd);
router.get('/script/:scriptId', AdScriptController.serveAdScript);
router.post('/view/:adId', adDisplayController.incrementView);
router.post('/click/:adId', adDisplayController.incrementClick);

module.exports = router;
