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

module.exports = router;