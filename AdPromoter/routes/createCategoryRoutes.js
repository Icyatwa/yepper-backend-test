// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/createCategoryController');
const WalletController = require('../controllers/WalletController');
const WithdrawalController = require('../controllers/WithdrawalController');
const adRejectionController = require('../controllers/AdRejectionController');
const authMiddleware = require('../../middleware/authmiddleware');

router.get('/category/:categoryId', categoryController.getCategoryById);
router.get('/:websiteId/advertiser', categoryController.getCategoriesByWebsiteForAdvertisers);

router.use(authMiddleware);

router.post('/', categoryController.createCategory);
router.get('/pending-rejections', authMiddleware, categoryController.getPendingRejections);
router.get('/active-ads', authMiddleware, categoryController.getActiveAds);
router.post('/reject/:adId/:websiteId/:categoryId', authMiddleware, categoryController.rejectAd);
router.put('/:categoryId/reset-user-count', categoryController.resetUserCount);
router.delete('/:categoryId', categoryController.deleteCategory);
router.get('/', categoryController.getCategories);
router.get('/:websiteId', categoryController.getCategoriesByWebsite);
router.patch('/category/:categoryId/language', categoryController.updateCategoryLanguage);
router.get('/pending/:ownerId', categoryController.getPendingAds);
router.put('/approve/:adId/website/:websiteId', categoryController.approveAdForWebsite);

router.get('/wallet', authMiddleware, WalletController.getWallet);
router.get('/wallet/transactions', authMiddleware, WalletController.getWalletTransactions);

router.get('/wallet/:ownerType/balance', authMiddleware, WalletController.getWalletBalance);
router.get('/wallet/:ownerType/transactions', authMiddleware, WalletController.getTransactionHistory);

router.post('/wallet/:ownerType/withdrawal-request', authMiddleware, WithdrawalController.createWithdrawalRequest);
router.get('/wallet/:ownerType/withdrawal-requests', authMiddleware, WithdrawalController.getUserWithdrawalRequests);
router.patch('/wallet/withdrawal-request/:requestId/cancel', authMiddleware, WithdrawalController.cancelWithdrawalRequest);
router.get('/admin/withdrawal-requests', authMiddleware, WithdrawalController.getAllWithdrawalRequests);
router.patch('/admin/withdrawal-request/:requestId/process', authMiddleware, WithdrawalController.processWithdrawalRequest);

router.post('/reject/:adId/:websiteId/:categoryId', authMiddleware, adRejectionController.rejectAd);
router.get('/pending-rejections', authMiddleware, adRejectionController.getPendingRejections);

module.exports = router;