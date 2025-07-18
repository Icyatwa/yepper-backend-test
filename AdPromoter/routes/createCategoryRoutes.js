// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/createCategoryController');
const authMiddleware = require('../../middleware/authMiddleware');

// All category routes require authentication
router.use(authMiddleware);

// Create a new category
router.post('/', categoryController.createCategory);

router.put('/:categoryId/reset-user-count', categoryController.resetUserCount);
router.delete('/:categoryId', categoryController.deleteCategory);
router.get('/', categoryController.getCategories);
router.get('/:websiteId/advertiser', categoryController.getCategoriesByWebsiteForAdvertisers);
router.get('/:websiteId', categoryController.getCategoriesByWebsite);
router.get('/category/:categoryId', categoryController.getCategoryById);
router.patch('/category/:categoryId/language', categoryController.updateCategoryLanguage);

router.get('/pending/:ownerId', categoryController.getPendingAds);
router.get('/mixed/:userId', categoryController.getUserMixedAds);
router.get('/pending-ad/:adId', categoryController.getPendingAdById);
router.put('/approve/:adId/website/:websiteId', categoryController.approveAdForWebsite);
router.put('/approve/:adId', categoryController.approveAd);
router.get('/approved-ads', categoryController.getApprovedAds);
router.get('/approved/:ownerId', categoryController.getApprovedAdsByUser);
router.get('/ad-details/:adId', categoryController.getAdDetails);
router.put('/confirm/:adId/website/:websiteId', categoryController.confirmWebsiteAd);

module.exports = router;