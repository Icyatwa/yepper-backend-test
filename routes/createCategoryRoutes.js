// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/createCategoryController');
const authMiddleware = require('../middleware/authMiddleware');

// All category routes require authentication
router.use(authMiddleware);

// Create a new category
router.post('/', categoryController.createCategory);

// router.put('/:categoryId/reset-user-count', adCategoryController.resetUserCount);
// router.delete('/:categoryId', adCategoryController.deleteCategory);
// router.get('/', adCategoryController.getCategories);
// router.get('/:websiteId/advertiser', adCategoryController.getCategoriesByWebsiteForAdvertisers);
// router.get('/:websiteId', adCategoryController.getCategoriesByWebsite);
// router.get('/category/:categoryId', adCategoryController.getCategoryById);
// router.patch('/category/:categoryId/language', adCategoryController.updateCategoryLanguage);

module.exports = router;