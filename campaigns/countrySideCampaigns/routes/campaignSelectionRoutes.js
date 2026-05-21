// routes/campaignSelectionRoutes.js
const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');

// Create a new campaign
router.post('/', campaignController.createCampaign);

// Get all campaigns
router.get('/', campaignController.getAllCampaigns);

// Get campaign statistics
router.get('/stats', campaignController.getCampaignStats);

// Get a single campaign by ID
router.get('/:id', campaignController.getCampaignById);

// Update a campaign
router.put('/:id', campaignController.updateCampaign);

// Update campaign status only
router.patch('/:id/status', campaignController.updateCampaignStatus);

// Delete a campaign
router.delete('/:id', campaignController.deleteCampaign);

// Duplicate a campaign
router.post('/:id/duplicate', campaignController.duplicateCampaign);

// Bulk delete campaigns
router.post('/bulk-delete', campaignController.bulkDeleteCampaigns);

module.exports = router;