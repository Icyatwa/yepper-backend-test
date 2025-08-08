// WebAdvertiseRoutes.js
const express = require('express');
const router = express.Router();
const WebAdvertiseController = require('../controllers/WebAdvertiseController');
const PaymentController = require('../controllers/PaymentController');
const availableAdsController = require('../controllers/AvailableAdsController');
const authMiddleware = require('../../middleware/authMiddleware');

router.post('/', authMiddleware, WebAdvertiseController.createImportAd);
router.get('/my-ads', authMiddleware, WebAdvertiseController.getMyAds);
router.get('/:adId', authMiddleware, WebAdvertiseController.getAdDetails);
router.get('/budget', authMiddleware, WebAdvertiseController.getAdBudget);
router.post('/:adId/add-selections', authMiddleware, WebAdvertiseController.addWebsiteSelectionsToAd);
router.put('/:adId/update', authMiddleware, WebAdvertiseController.updateAdDetails);
router.get('/available/:websiteId', authMiddleware, WebAdvertiseController.getAvailableAdsForWebsite);
router.post('/select-for-website', authMiddleware, WebAdvertiseController.selectAdForWebsite);

router.get('/mixed/:userId', WebAdvertiseController.getUserMixedAds);
// router.get('/:adId/details', WebAdvertiseController.getAdDetails);

router.post('/payment/initiate', authMiddleware, PaymentController.initiatePayment);
router.post('/payment/verify', PaymentController.verifyPayment);
router.post('/payment/webhook', PaymentController.handleWebhook);

// Get refund information for a specific ad
router.get('/:adId/refund-info', authMiddleware, WebAdvertiseController.getAdRefundInfo);

// Get all ads available for reassignment
router.get('/reassignable', authMiddleware, WebAdvertiseController.getReassignableAds);

// Reassign ad with refund application
router.post('/:adId/reassign', authMiddleware, WebAdvertiseController.reassignAdWithRefund);

// Enhanced payment routes
router.post('/payment/initiate-with-refund', authMiddleware, PaymentController.initiatePaymentWithRefund);
router.post('/payment/verify-with-refund', authMiddleware, PaymentController.verifyPaymentWithRefund);
router.post('/payment/refund-only', authMiddleware, PaymentController.processRefundOnlyPayment);


router.get('/available', authMiddleware, availableAdsController.getAvailableAds);
router.post('/assign', authMiddleware, availableAdsController.assignAdToCategoryWithPayment);


// router.put('/confirm/:adId/website/:websiteId', WebAdvertiseController.confirmWebsiteAd);
// router.post('/initiate-payment', authMiddleware, WebAdvertiseController.initiateAdPayment);
// router.get('/callback', WebAdvertiseController.adPaymentCallback);

module.exports = router;