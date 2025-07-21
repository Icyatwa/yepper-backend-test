// WebAdvertiseRoutes.js
const express = require('express');
const router = express.Router();
const WebAdvertiseController = require('../controllers/WebAdvertiseController');
const authMiddleware = require('../../middleware/authMiddleware');

router.post('/', authMiddleware, WebAdvertiseController.createImportAd);
router.get('/mixed/:userId', WebAdvertiseController.getUserMixedAds);
router.get('/ad-details/:adId', WebAdvertiseController.getAdDetails);
router.put('/confirm/:adId/website/:websiteId', WebAdvertiseController.confirmWebsiteAd);

module.exports = router;