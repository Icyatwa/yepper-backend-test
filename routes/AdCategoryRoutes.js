// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const adCategoryController = require('../controllers/AdCategoryController');

router.post('/', adCategoryController.createCategory);
router.put('/:categoryId/reset-user-count', adCategoryController.resetUserCount);
router.delete('/:categoryId', adCategoryController.deleteCategory);
router.get('/', adCategoryController.getCategories);
router.get('/:websiteId/advertiser', adCategoryController.getCategoriesByWebsiteForAdvertisers);
router.get('/:websiteId', adCategoryController.getCategoriesByWebsite);
router.get('/category/:categoryId', adCategoryController.getCategoryById);
router.patch('/category/:categoryId/language', adCategoryController.updateCategoryLanguage);

module.exports = router;