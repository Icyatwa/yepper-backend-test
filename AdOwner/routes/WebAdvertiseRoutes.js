// WebAdvertiseRoutes.js
const express = require('express');
const router = express.Router();
const WebAdvertiseController = require('../controllers/WebAdvertiseController');
const PaymentController = require('../controllers/PaymentController');
const authMiddleware = require('../../middleware/authMiddleware');

router.post('/', authMiddleware, WebAdvertiseController.createImportAd);
router.get('/mixed/:userId', WebAdvertiseController.getUserMixedAds);
router.get('/ad-details/:adId', WebAdvertiseController.getAdDetails);
router.put('/confirm/:adId/website/:websiteId', WebAdvertiseController.confirmWebsiteAd);

router.post('/payment/initiate', authMiddleware, PaymentController.initiatePayment);
router.post('/payment/verify', PaymentController.verifyPayment);
router.post('/payment/webhook', PaymentController.handleWebhook);

// router.post('/initiate-payment', authMiddleware, WebAdvertiseController.initiateAdPayment);
// router.get('/callback', WebAdvertiseController.adPaymentCallback);

module.exports = router;