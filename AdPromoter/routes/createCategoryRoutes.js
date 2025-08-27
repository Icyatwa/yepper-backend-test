// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/createCategoryController');
const WalletController = require('../controllers/WalletController');
const adRejectionController = require('../controllers/AdRejectionController');
const authMiddleware = require('../../middleware/authmiddleware');

router.use(authMiddleware);

router.post('/', categoryController.createCategory);
router.get('/pending-rejections', authMiddleware, categoryController.getPendingRejections);
router.get('/active-ads', authMiddleware, categoryController.getActiveAds);
router.post('/reject/:adId/:websiteId/:categoryId', authMiddleware, categoryController.rejectAd);

router.put('/:categoryId/reset-user-count', categoryController.resetUserCount);
router.delete('/:categoryId', categoryController.deleteCategory);
router.get('/', categoryController.getCategories);
router.get('/:websiteId/advertiser', categoryController.getCategoriesByWebsiteForAdvertisers);
router.get('/:websiteId', categoryController.getCategoriesByWebsite);
router.get('/category/:categoryId', categoryController.getCategoryById);
router.patch('/category/:categoryId/language', categoryController.updateCategoryLanguage);
router.get('/pending/:ownerId', categoryController.getPendingAds);
router.put('/approve/:adId/website/:websiteId', categoryController.approveAdForWebsite);

router.get('/wallet', authMiddleware, WalletController.getWallet);
router.get('/wallet/transactions', authMiddleware, WalletController.getWalletTransactions);

router.get('/wallet/:ownerType/balance', authMiddleware, WalletController.getWalletBalance);
router.get('/wallet/:ownerType/transactions', authMiddleware, WalletController.getTransactionHistory);

router.post('/reject/:adId/:websiteId/:categoryId', authMiddleware, adRejectionController.rejectAd);
router.get('/pending-rejections', authMiddleware, adRejectionController.getPendingRejections);

// router.get('/check-eligibility/:payment', categoryController.checkWithdrawalEligibility);
// router.get('/balance/:userId', categoryController.getWebOwnerBalance);
// router.get('/earnings/:userId', categoryController.getDetailedEarnings);
// router.post('/withdraw', authMiddleware, categoryController.initiateWithdrawal);
// router.post('/withdrawal-callback', categoryController.withdrawalCallback);
// router.post('/withdraw-manual', categoryController.requestManualWithdrawal);
// router.get('/diagnostic/flutterwave-ip', categoryController.checkIPAndFlutterwaveAccess);
// router.get('/manual-withdrawals', categoryController.getManualWithdrawals);

module.exports = router;