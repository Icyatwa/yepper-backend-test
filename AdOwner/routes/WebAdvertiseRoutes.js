// WebAdvertiseRoutes.js
const express = require('express');
const router = express.Router();
const WebAdvertiseController = require('../controllers/WebAdvertiseController');

router.post('/', WebAdvertiseController.createImportAd);
router.get('/', WebAdvertiseController.getAllAds);
router.get('/ad/:id', WebAdvertiseController.getAdByIds);
router.get('/ads/:userId', WebAdvertiseController.getAdsByUserId);
router.get('/projects/:userId', WebAdvertiseController.getProjectsByUserId);
router.get('/ads/:userId/with-clicks', WebAdvertiseController.getAdsByUserIdWithClicks);

router.get('/pending/:ownerId', WebAdvertiseController.getPendingAds);
router.get('/mixed/:userId', WebAdvertiseController.getUserMixedAds);
router.get('/pending-ad/:adId', WebAdvertiseController.getPendingAdById);
router.put('/approve/:adId/website/:websiteId', WebAdvertiseController.approveAdForWebsite);
router.put('/approve/:adId', WebAdvertiseController.approveAd);
router.get('/approved-ads', WebAdvertiseController.getApprovedAds);
router.get('/approved/:ownerId', WebAdvertiseController.getApprovedAdsByUser);
router.get('/ad-details/:adId', WebAdvertiseController.getAdDetails);
router.put('/confirm/:adId/website/:websiteId', WebAdvertiseController.confirmWebsiteAd);

module.exports = router;