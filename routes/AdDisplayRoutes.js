// AdDisplayRoutes.js
const express = require('express');
const router = express.Router();
const adDisplayController = require('../controllers/AdDisplayController');
const AdScriptController = require('../controllers/AdScriptController');
const adDetailController = require('../controllers/AdDetailController');

router.get('/display', adDisplayController.displayAd);
router.get('/script/:scriptId', AdScriptController.serveAdScript);
router.post('/view/:adId', adDisplayController.incrementView);
router.post('/click/:adId', adDisplayController.incrementClick);
router.get('/ads/get/:adId', adDisplayController.getAdDetails);
router.get('/details/:adId', adDetailController.getAdDetails);
router.post('/modalView/:adId', adDetailController.trackModalView);
module.exports = router;
