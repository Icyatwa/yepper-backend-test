// AdDisplayRoutes.js
const express = require('express');
const router = express.Router();
const adDisplayController = require('../controllers/AdDisplayController');

router.get('/display', adDisplayController.displayAd);
// router.post('/view', adDisplayController.incrementView);
// router.post('/click', adDisplayController.incrementClick);

router.post('/view/:adId', adDisplayController.incrementView);
router.post('/click/:adId', adDisplayController.incrementClick);
module.exports = router;
