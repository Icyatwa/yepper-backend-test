// routes/campaignRoutes.js
const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const authMiddleware = require('../middleware/authmiddleware');

router.post('/', authMiddleware, campaignController.createCampaign);
router.get('/my-campaigns', authMiddleware, campaignController.getUserCampaigns);
router.get('/stats', campaignController.getCampaignStats);
router.get('/', campaignController.getAllCampaigns);

router.get('/:id', authMiddleware, campaignController.getCampaignById);
router.patch('/:id/status', authMiddleware, campaignController.updateCampaignStatus);
router.patch('/:id', authMiddleware, campaignController.updateCampaign);
router.delete('/:id', authMiddleware, campaignController.deleteCampaign);

module.exports = router;