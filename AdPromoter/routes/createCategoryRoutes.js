// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/createCategoryController');
const authMiddleware = require('../../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/', categoryController.createCategory);
router.put('/:categoryId/reset-user-count', categoryController.resetUserCount);
router.delete('/:categoryId', categoryController.deleteCategory);
router.get('/', categoryController.getCategories);
router.get('/:websiteId/advertiser', categoryController.getCategoriesByWebsiteForAdvertisers);
router.get('/:websiteId', categoryController.getCategoriesByWebsite);
router.get('/category/:categoryId', categoryController.getCategoryById);
router.patch('/category/:categoryId/language', categoryController.updateCategoryLanguage);
router.get('/pending/:ownerId', categoryController.getPendingAds);
router.put('/approve/:adId/website/:websiteId', categoryController.approveAdForWebsite);

router.get('/check-eligibility/:payment', categoryController.checkWithdrawalEligibility);
router.get('/balance/:userId', categoryController.getWebOwnerBalance);
router.get('/earnings/:userId', categoryController.getDetailedEarnings);
router.post('/withdraw', categoryController.initiateWithdrawal);
router.post('/withdrawal-callback', categoryController.withdrawalCallback);

module.exports = router;