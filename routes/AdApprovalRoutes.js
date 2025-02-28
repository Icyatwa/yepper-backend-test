// // AdApprovalRoutes.js
// const express = require('express');
// const router = express.Router();
// const adApprovalController = require('../controllers/AdApprovalController');

// router.get('/pending/:ownerId', adApprovalController.getPendingAds);
// router.get('/mixed/:userId', adApprovalController.getUserMixedAds);
// router.get('/pending-ad/:adId', adApprovalController.getPendingAdById);
// router.put('/approve/:adId/website/:websiteId', adApprovalController.approveAdForWebsite);
// router.put('/approve/:adId', adApprovalController.approveAd);
// // router.get('/approved-awaiting-confirmation/:userId', adApprovalController.getApprovedAdsAwaitingConfirmation);
// router.get('/ad-details/:adId', adApprovalController.getAdDetails);
// router.put('/confirm/:adId/website/:websiteId', adApprovalController.confirmWebsiteAd);
// router.post('/initiate-payment', adApprovalController.initiateAdPayment);
// router.get('/callback', adApprovalController.adPaymentCallback);
// router.get('/balance/:userId', adApprovalController.getWebOwnerBalance);
// router.post('/withdraw', adApprovalController.initiateWithdrawal);
// router.post('/withdrawal-callback', adApprovalController.withdrawalCallback);
// router.get('/payments/:userId', adApprovalController.getOwnerPayments);
// router.get('/approved-ads', adApprovalController.getApprovedAds);
// router.get('/approved/:ownerId', adApprovalController.getApprovedAdsByUser);
// // router.get('/user-pending/:userId', adApprovalController.getUserPendingAds);

// module.exports = router;















// AdApprovalRoutes.js
const express = require('express');
const router = express.Router();
const adApprovalController = require('../controllers/AdApprovalController');

router.get('/pending/:ownerId', adApprovalController.getPendingAds);
router.get('/mixed/:userId', adApprovalController.getUserMixedAds);
router.get('/pending-ad/:adId', adApprovalController.getPendingAdById);
router.put('/approve/:adId/website/:websiteId', adApprovalController.approveAdForWebsite);
router.put('/approve/:adId', adApprovalController.approveAd);
router.get('/approved-ads', adApprovalController.getApprovedAds);
router.get('/approved/:ownerId', adApprovalController.getApprovedAdsByUser);
router.get('/ad-details/:adId', adApprovalController.getAdDetails);
router.put('/confirm/:adId/website/:websiteId', adApprovalController.confirmWebsiteAd);


router.post('/initiate-payment', adApprovalController.initiateAdPayment);
router.get('/callback', adApprovalController.adPaymentCallback);
router.get('/check-eligibility/:payment', adApprovalController.checkWithdrawalEligibility);
router.get('/balance/:userId', adApprovalController.getWebOwnerBalance);
router.get('/earnings/:userId', adApprovalController.getDetailedEarnings);
router.post('/withdraw', adApprovalController.initiateWithdrawal);
router.post('/withdrawal-callback', adApprovalController.withdrawalCallback);

module.exports = router;