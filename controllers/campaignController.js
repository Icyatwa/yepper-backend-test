
// controllers/campaignController.js
const Campaign = require('../models/Campaign');
const authMiddleware = require('../middleware/authmiddleware');

// Create a new campaign
exports.createCampaign = async (req, res) => {
  try {
    const {
      fullName,
      businessName,
      phoneNumber,
      selectedChannels,
      selectedPlatforms,
      notes,
      userEmail
    } = req.body;

    // Get userId from authenticated user (via authMiddleware) or from request body
    let userId = null;
    let email = userEmail;

    // If user is authenticated via middleware
    if (req.user && req.user.userId) {
      userId = req.user.userId;
      email = req.user.email;
    }

    // Validate required fields
    if (!fullName || !businessName || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Full name, business name, and phone number are required'
      });
    }

    if (!selectedChannels || selectedChannels.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one channel must be selected'
      });
    }

    if (!selectedPlatforms || selectedPlatforms.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one platform must be selected'
      });
    }

    // Create campaign with optional userId
    const campaignData = {
      fullName,
      businessName,
      phoneNumber,
      selectedChannels,
      selectedPlatforms,
      notes
    };

    // Add userId if user is authenticated
    if (userId) {
      campaignData.userId = userId;
    }

    // Add email if provided
    if (email) {
      campaignData.userEmail = email;
    }

    const campaign = await Campaign.create(campaignData);

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: {
        campaignId: campaign._id,
        fullName: campaign.fullName,
        businessName: campaign.businessName,
        phoneNumber: campaign.phoneNumber,
        selectedChannels: campaign.selectedChannels,
        platformCount: campaign.selectedPlatforms.length,
        status: campaign.status,
        createdAt: campaign.createdAt
      }
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create campaign',
      error: error.message
    });
  }
};

exports.getUserCampaigns = async (req, res) => {
  try {
    const userId = req.user.userId;

    const campaigns = await Campaign.find({ userId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: campaigns.length,
      data: campaigns
    });
  } catch (error) {
    console.error('Get user campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns',
      error: error.message
    });
  }
};

exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Validate ObjectId format
    if (!id || id === 'undefined' || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid campaign ID format'
      });
    }

    const campaign = await Campaign.findOne({ _id: id, userId });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign',
      error: error.message
    });
  }
};

exports.getAllCampaigns = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      channel,
      search 
    } = req.query;

    const query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by channel
    if (channel) {
      query.selectedChannels = channel;
    }

    // Search by name, business, or phone
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Campaign.countDocuments(query);

    res.status(200).json({
      success: true,
      data: campaigns,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve campaigns',
      error: error.message
    });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.userId;

    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: campaign
    });
  } catch (error) {
    console.error('Update campaign error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update campaign',
      error: error.message
    });
  }
};

exports.updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    const validStatuses = ['pending', 'contacted', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, userId },
      { status },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      message: 'Campaign status updated',
      data: campaign
    });
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update campaign',
      error: error.message
    });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const campaign = await Campaign.findOneAndDelete({ _id: id, userId });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete campaign',
      error: error.message
    });
  }
};

exports.getCampaignStats = async (req, res) => {
  try {
    const stats = await Campaign.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          contacted: {
            $sum: { $cond: [{ $eq: ['$status', 'contacted'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    const channelStats = await Campaign.aggregate([
      { $unwind: '$selectedChannels' },
      {
        $group: {
          _id: '$selectedChannels',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {},
        byChannel: channelStats
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
      error: error.message
    });
  }
};