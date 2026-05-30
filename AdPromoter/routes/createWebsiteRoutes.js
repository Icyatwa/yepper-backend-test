// createWebsiteRoutes.js
const express = require('express');
const router = express.Router();
const websiteController = require('../controllers/createWebsiteController');
const earningsController = require('../controllers/earningsController');
const authMiddleware = require('../../middleware/authmiddleware');
const { generateSiteScript } = require('../controllers/SiteScriptController');
const Website = require('../models/CreateWebsiteModel');

// createWebsiteRoutes.js
router.post('/', websiteController.createWebsite);
router.post('/prepareWebsite', websiteController.prepareWebsite);
router.post('/initiate-verification', websiteController.initiateVerification);
router.post('/verify-domain', websiteController.verifyDomain);
router.post('/upload/:websiteId', websiteController.uploadWebsiteImage);
router.post('/createWebsiteWithCategories', websiteController.createWebsiteWithCategories);

router.patch('/:websiteId/name', websiteController.updateWebsiteName);
router.get('/', websiteController.getAllWebsites);
router.get('/website/:websiteId', websiteController.getWebsiteById);

// ✅ Two-segment routes MUST come before the single-segment wildcard
router.get('/:websiteId/earnings-summary', authMiddleware, earningsController.getWebsiteEarningsSummary);

// ✅ Single-segment wildcard last — it catches everything above it otherwise
router.get('/:ownerId', websiteController.getWebsitesByOwner);

// TEMPORARY — delete this route after running it once
router.post('/admin/regenerate-site-scripts', async (req, res) => {
  try {
    const websites = await Website.find({});
    let updated = 0;
    for (const site of websites) {
      await generateSiteScript(site._id.toString());
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;