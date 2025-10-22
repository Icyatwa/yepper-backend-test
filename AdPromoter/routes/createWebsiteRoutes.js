// createWebsiteRoutes.js
const express = require('express');
const router = express.Router();
const websiteController = require('../controllers/createWebsiteController');

router.post('/', websiteController.createWebsite);
router.post('/prepareWebsite', websiteController.prepareWebsite);
router.post('/upload/:websiteId', websiteController.uploadWebsiteImage);
router.post('/createWebsiteWithCategories', websiteController.createWebsiteWithCategories);
 
router.patch('/:websiteId/name', websiteController.updateWebsiteName)
router.get('/', websiteController.getAllWebsites);
router.get('/:ownerId', websiteController.getWebsitesByOwner);
router.get('/website/:websiteId', websiteController.getWebsiteById);

module.exports = router;
