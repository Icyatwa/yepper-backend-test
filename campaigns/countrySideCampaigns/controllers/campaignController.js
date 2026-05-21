// controllers/campaignController.js
const CountrySide_Campaigns = require('../models/Campaign');

// Create a new campaign
exports.createCampaign = async (req, res) => {
  try {
    const { 
      campaignName, 
      selectedPlatforms, 
      selectedCategories,
      selectedRateCards,
      totalCost,
      status,
      startDate,
      endDate,
      notes
    } = req.body;

    // Validate required fields
    if (!campaignName || !selectedPlatforms || !Array.isArray(selectedPlatforms)) {
      return res.status(400).json({
        success: false,
        message: 'Campaign name and selected platforms are required'
      });
    }

    // Process platforms with their rate cards
    const processedPlatforms = selectedPlatforms.map(platform => {
      const platformRateCards = selectedRateCards?.[platform.platformId] || [];
      
      return {
        platformId: platform.platformId,
        platformName: platform.platformName,
        category: platform.category,
        selectedRateCards: platformRateCards.map(cardIndex => ({
          rateCardIndex: cardIndex
        }))
      };
    });

    // Create new campaign
    const campaign = new CountrySide_Campaigns({
      campaignName,
      selectedPlatforms: processedPlatforms,
      selectedCategories: selectedCategories || {},
      totalCost: totalCost || 0,
      status: status || 'draft',
      startDate,
      endDate,
      notes
    });

    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating campaign',
      error: error.message
    });
  }
};

// Get all campaigns
exports.getAllCampaigns = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, sort = '-createdAt' } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const campaigns = await CountrySide_Campaigns.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CountrySide_Campaigns.countDocuments(query);

    res.status(200).json({
      success: true,
      data: campaigns,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaigns',
      error: error.message
    });
  }
};

// Get a single campaign by ID
exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await CountrySide_Campaigns.findById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.status(200).json({
      success: true,
      data: campaign
    });

  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaign',
      error: error.message
    });
  }
};

// Update a campaign
exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find campaign
    const campaign = await CountrySide_Campaigns.findById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Process platform updates if provided
    if (updates.selectedPlatforms) {
      const processedPlatforms = updates.selectedPlatforms.map(platform => {
        const platformRateCards = updates.selectedRateCards?.[platform.platformId] || [];
        
        return {
          platformId: platform.platformId,
          platformName: platform.platformName,
          category: platform.category,
          selectedRateCards: platformRateCards.map(cardIndex => ({
            rateCardIndex: cardIndex
          }))
        };
      });
      
      campaign.selectedPlatforms = processedPlatforms;
    }

    // Update other fields
    if (updates.campaignName) campaign.campaignName = updates.campaignName;
    if (updates.selectedCategories !== undefined) campaign.selectedCategories = updates.selectedCategories;
    if (updates.totalCost !== undefined) campaign.totalCost = updates.totalCost;
    if (updates.status) campaign.status = updates.status;
    if (updates.startDate) campaign.startDate = updates.startDate;
    if (updates.endDate) campaign.endDate = updates.endDate;
    if (updates.notes !== undefined) campaign.notes = updates.notes;

    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campaign updated successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating campaign',
      error: error.message
    });
  }
};

// Delete a campaign
exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await CountrySide_Campaigns.findByIdAndDelete(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting campaign',
      error: error.message
    });
  }
};

// Update campaign status
exports.updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'active', 'paused', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Must be one of: draft, active, paused, completed'
      });
    }

    const campaign = await CountrySide_Campaigns.findById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    campaign.status = status;
    await campaign.save();

    res.status(200).json({
      success: true,
      message: 'Campaign status updated successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating campaign status',
      error: error.message
    });
  }
};

// Get campaign statistics
exports.getCampaignStats = async (req, res) => {
  try {
    const stats = await CountrySide_Campaigns.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalCost: { $sum: '$totalCost' }
        }
      }
    ]);

    const totalCampaigns = await CountrySide_Campaigns.countDocuments();
    const totalCost = await CountrySide_Campaigns.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$totalCost' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        total: totalCampaigns,
        totalCost: totalCost.length > 0 ? totalCost[0].total : 0,
        byStatus: stats
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching campaign statistics',
      error: error.message
    });
  }
};

// Duplicate a campaign
exports.duplicateCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const originalCampaign = await CountrySide_Campaigns.findById(id);

    if (!originalCampaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    const duplicatedCampaign = new CountrySide_Campaigns({
      campaignName: `${originalCampaign.campaignName} (Copy)`,
      selectedPlatforms: originalCampaign.selectedPlatforms,
      selectedCategories: originalCampaign.selectedCategories,
      totalCost: originalCampaign.totalCost,
      status: 'draft',
      notes: originalCampaign.notes
    });

    await duplicatedCampaign.save();

    res.status(201).json({
      success: true,
      message: 'Campaign duplicated successfully',
      data: duplicatedCampaign
    });

  } catch (error) {
    console.error('Duplicate campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Error duplicating campaign',
      error: error.message
    });
  }
};

// Bulk delete campaigns
exports.bulkDeleteCampaigns = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of campaign IDs'
      });
    }

    const result = await CountrySide_Campaigns.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} campaign(s) deleted successfully`,
      data: { deletedCount: result.deletedCount }
    });

  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting campaigns',
      error: error.message
    });
  }
};