// routes/businessCategoriesRoutes.js
const express = require('express');
const router = express.Router();
const businessCategoriesController = require('../controllers/businessCategoriesController');

// Get all valid categories (public route)
router.get('/categories', businessCategoriesController.getAllValidCategories);

// Get business categories for a specific website
router.get('/website/:websiteId', businessCategoriesController.getBusinessCategories);

// Update business categories for a website
router.put('/website/:websiteId', businessCategoriesController.updateBusinessCategories);

module.exports = router;