// createCategoryController.js
const mongoose = require('mongoose');
const AdCategory = require('../models/CreateCategoryModel');
const User = require('../../models/User');
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const Website = require('../models/CreateWebsiteModel');

const generateScriptTag = (categoryId) => {
  return {
    script: `<script src="http://localhost:5000/api/ads/script/${categoryId}"></script>`
  };
};

exports.createCategory = async (req, res) => {
  try {
    // Add debugging to see what's in req.user
    console.log('req.user:', req.user);
    console.log('req.headers:', req.headers);
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required. Please login.' });
    }

    const { 
      websiteId,
      categoryName,
      description,
      price,
      customAttributes,
      spaceType,
      userCount,
      instructions,
      visitorRange,
      tier
    } = req.body;

    // Get userId from req.user with fallback options
    const userId = req.user.userId || req.user.id || req.user._id;

    if (!userId) {
      console.error('No userId found in req.user:', req.user);
      return res.status(401).json({ message: 'User ID not found in authentication data' });
    }

    // Try to find user by ID
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found in database with ID:', userId);
      return res.status(401).json({ message: 'User not found in database' });
    }

    const ownerId = user._id.toString();
    const webOwnerEmail = user.email;

    // Validation
    if (!websiteId || !categoryName || !price || !spaceType || !visitorRange || !tier) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['websiteId', 'categoryName', 'price', 'spaceType', 'visitorRange', 'tier'],
        received: { websiteId, categoryName, price, spaceType, visitorRange, tier }
      });
    }

    // Create new category
    const newCategory = new AdCategory({
      ownerId,
      websiteId,
      categoryName,
      description,
      price,
      spaceType,
      userCount: userCount || 0,
      instructions,
      customAttributes: customAttributes || {},
      webOwnerEmail,
      selectedAds: [],
      visitorRange,
      tier
    });

    const savedCategory = await newCategory.save();
    const { script } = generateScriptTag(savedCategory._id.toString());

    // Update with API codes
    savedCategory.apiCodes = {
      HTML: script,
      JavaScript: `const script = document.createElement('script');\nscript.src = "http://localhost:5000/api/ads/script/${savedCategory._id}";\ndocument.body.appendChild(script);`,
      PHP: `<?php echo '${script}'; ?>`,
      Python: `print('${script}')`
    };

    const finalCategory = await savedCategory.save();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: finalCategory
    });
    
  } catch (error) {
    console.error('Error creating category:', error);
    
    // Handle specific mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Category with this name already exists for this website' 
      });
    }

    res.status(500).json({ 
      message: 'Failed to create category', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

exports.resetUserCount = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { newUserCount } = req.body;

    // Validate input
    if (!newUserCount || newUserCount < 0) {
      return res.status(400).json({ 
        error: 'Invalid Input', 
        message: 'User count must be a non-negative number' 
      });
    }

    // Find the category
    const category = await AdCategory.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Category not found' 
      });
    }

    // Count current users who have selected this category
    const currentUserCount = await ImportAd.countDocuments({
      'websiteSelections.categories': categoryId,
      'websiteSelections.approved': true
    });

    // Ensure new user count is not less than current users
    if (newUserCount < currentUserCount) {
      return res.status(400).json({ 
        error: 'Invalid Reset', 
        message: 'New user count cannot be less than current approved users' 
      });
    }

    // Update the category with new user count
    category.userCount = newUserCount;
    await category.save();

    res.status(200).json({
      message: 'User count reset successfully',
      category
    });
  } catch (error) {
    console.error('Error resetting user count:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};

exports.deleteCategory = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { categoryId } = req.params;
    const { ownerId } = req.body;

    // Find the category
    const category = await AdCategory.findById(categoryId);

    // Check if category exists
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Verify the owner
    if (category.ownerId !== ownerId) {
      return res.status(403).json({ message: 'Unauthorized to delete this category' });
    }

    // Check for any ads with this category confirmed or approved
    const existingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          'categories': categoryId,
          $or: [
            { 'confirmed': true },
            { 'approved': true }
          ]
        }
      }
    });

    // If any ads exist with this category confirmed or approved, prevent deletion
    if (existingAds.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category with active or confirmed ads',
        affectedAds: existingAds.map(ad => ad._id)
      });
    }

    // Start transaction
    session.startTransaction();

    try {
      // Delete the category
      await AdCategory.findByIdAndDelete(categoryId).session(session);

      // Remove references to this category from all ImportAd documents
      await ImportAd.updateMany(
        { 'websiteSelections.categories': categoryId },
        { 
          $pull: { 
            'websiteSelections.$.categories': categoryId 
          } 
        }
      ).session(session);

      // Commit the transaction
      await session.commitTransaction();

      res.status(200).json({ 
        message: 'Category deleted successfully' 
      });

    } catch (transactionError) {
      // Abort the transaction on error
      await session.abortTransaction();
      throw transactionError;
    }

  } catch (error) {
    console.error('Error deleting category:', error);
    
    // Ensure session is ended even if there's an error
    if (session) {
      await session.endSession();
    }

    res.status(500).json({ 
      message: 'Failed to delete category', 
      error: error.message 
    });
  } finally {
    // Ensure session is always ended
    if (session) {
      await session.endSession();
    }
  }
};

exports.getCategories = async (req, res) => {
  const { ownerId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ ownerId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ ownerId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
  }
};

exports.getCategoriesByWebsiteForAdvertisers = async (req, res) => {
  const { websiteId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    // Validate websiteId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(websiteId)) {
      return res.status(400).json({ message: 'Invalid website ID' });
    }

    const websiteObjectId = new mongoose.Types.ObjectId(websiteId);

    const categories = await AdCategory.aggregate([
      { $match: { websiteId: websiteObjectId } },
      {
        $lookup: {
          from: 'importads', 
          let: { categoryId: '$_id' },
          pipeline: [
            { $unwind: { path: '$websiteSelections', preserveNullAndEmptyArrays: true } },
            { $match: { 
              $expr: { 
                $and: [
                  { $eq: ['$websiteSelections.websiteId', websiteObjectId] },
                  { $in: ['$$categoryId', '$websiteSelections.categories'] }
                ]
              }
            }},
            { $count: 'categoryCount' }
          ],
          as: 'currentUserCount'
        }
      },
      {
        $addFields: {
          currentUserCount: { 
            $ifNull: [{ $arrayElemAt: ['$currentUserCount.categoryCount', 0] }, 0] 
          },
          isFullyBooked: { 
            $gte: [
              { $ifNull: [{ $arrayElemAt: ['$currentUserCount.categoryCount', 0] }, 0] }, 
              '$userCount' 
            ] 
          }
        }
      }
    ])
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const count = await AdCategory.countDocuments({ websiteId: websiteObjectId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error in getCategoriesByWebsiteForAdvertisers:', error);
    res.status(500).json({ 
      message: 'Failed to fetch categories', 
      error: error.message 
    });
  }
};

exports.getCategoriesByWebsite = async (req, res) => {
  const { websiteId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ websiteId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ websiteId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
  }
};

exports.getCategoryById = async (req, res) => {
  const { categoryId } = req.params;

  try {
    const category = await AdCategory.findById(categoryId);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch category', error });
  }
};

exports.updateCategoryLanguage = async (req, res) => {
  const { categoryId } = req.params;
  const { defaultLanguage } = req.body;
  
  try {
    const updatedCategory = await AdCategory.findByIdAndUpdate(
      categoryId,
      { defaultLanguage },
      { new: true, runValidators: true }
    );
    
    if (!updatedCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.status(200).json(updatedCategory);
  } catch (error) {
    console.error('Error updating category language:', error);
    res.status(500).json({ message: 'Error updating category language', error: error.message });
  }
};

exports.getPendingAds = async (req, res) => {
  try {
    const { ownerId } = req.params;
    console.log('🔍 Debug: ownerId received:', ownerId);
    
    // First verify the requesting user owns these websites
    const websites = await Website.find({ 
      ownerId: ownerId 
    });
    
    console.log('🔍 Debug: websites found:', websites.length);
    console.log('🔍 Debug: website details:', websites.map(w => ({ id: w._id, name: w.websiteName })));
    
    if (!websites.length) {
      console.log('❌ Debug: No websites found for owner:', ownerId);
      return res.status(403).json({ 
        message: 'No websites found for this owner' 
      });
    }

    const websiteIds = websites.map(website => website._id);
    console.log('🔍 Debug: websiteIds array:', websiteIds);

    // Check all ads first (for debugging)
    const allAds = await ImportAd.find({});
    console.log('🔍 Debug: Total ads in database:', allAds.length);
    console.log('🔍 Debug: All ads websiteSelections:', allAds.map(ad => ({
      id: ad._id,
      businessName: ad.businessName,
      websiteSelections: ad.websiteSelections.map(ws => ({
        websiteId: ws.websiteId,
        approved: ws.approved
      }))
    })));

    // Add owner verification to the query
    const pendingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          websiteId: { $in: websiteIds },
          approved: false
        }
      }
    })
    .populate({
      path: 'websiteSelections.websiteId',
      match: { ownerId: ownerId } // Only populate websites owned by the requesting user
    })
    .populate('websiteSelections.categories');

    console.log('🔍 Debug: Raw pending ads found:', pendingAds.length);
    console.log('🔍 Debug: Pending ads before transformation:', pendingAds.map(ad => ({
      id: ad._id,
      businessName: ad.businessName,
      websiteSelections: ad.websiteSelections.map(ws => ({
        websiteId: ws.websiteId,
        approved: ws.approved,
        populated: ws.websiteId !== null
      }))
    })));

    // Filter out any selections where websiteId is null (means user doesn't own it)
    const transformedAds = pendingAds
      .map(ad => {
        // Only include website selections the user owns
        const validSelections = ad.websiteSelections.filter(
          selection => selection.websiteId !== null
        );

        console.log('🔍 Debug: Valid selections for ad', ad.businessName, ':', validSelections.length);

        // If no valid selections remain, return null
        if (validSelections.length === 0) return null;

        return {
          _id: ad._id,
          businessName: ad.businessName,
          businessLink: ad.businessLink,
          businessLocation: ad.businessLocation,
          adDescription: ad.adDescription,
          imageUrl: ad.imageUrl,
          videoUrl: ad.videoUrl,
          pdfUrl: ad.pdfUrl,
          websiteDetails: validSelections.map(selection => ({
            website: selection.websiteId,
            categories: selection.categories,
            approved: selection.approved
          }))
        };
      })
      .filter(ad => ad !== null); // Remove any null entries

    console.log('🔍 Debug: Final transformed ads:', transformedAds.length);
    console.log('🔍 Debug: Sending response:', JSON.stringify(transformedAds, null, 2));

    res.status(200).json(transformedAds);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ message: 'Error fetching pending ads', error: error.message });
  }
};

exports.approveAdForWebsite = async (req, res) => {
  try {
    const { adId, websiteId } = req.params;

    // First verify the ad and website exist
    const ad = await ImportAd.findById(adId);
    const website = await Website.findById(websiteId);

    if (!ad || !website) {
      return res.status(404).json({ 
        message: `${!ad ? 'Ad' : 'Website'} not found` 
      });
    }

    // Find the website selection that matches our websiteId
    const websiteSelection = ad.websiteSelections.find(
      ws => ws.websiteId.toString() === websiteId
    );

    if (!websiteSelection) {
      return res.status(404).json({ 
        message: 'This ad is not associated with the specified website' 
      });
    }

    // Update the approval status
    const updatedAd = await ImportAd.findOneAndUpdate(
      { 
        _id: adId,
        'websiteSelections.websiteId': websiteId 
      },
      {
        $set: {
          'websiteSelections.$.approved': true,
          'websiteSelections.$.approvedAt': new Date()
        }
      },
      { 
        new: true,
        runValidators: true 
      }
    ).populate('websiteSelections.websiteId websiteSelections.categories');

    if (!updatedAd) {
      return res.status(500).json({ 
        message: 'Error updating ad approval status' 
      });
    }

    // Check if all websites are now approved
    const allWebsitesApproved = updatedAd.websiteSelections.every(ws => ws.approved);

    // If all websites are approved, update the main confirmed status
    if (allWebsitesApproved && !updatedAd.confirmed) {
      updatedAd.confirmed = true;
      await updatedAd.save();
    }

    res.status(200).json({
      message: 'Ad approved successfully',
      ad: updatedAd,
      allApproved: allWebsitesApproved
    });

  } catch (error) {
    console.error('Ad approval error:', error);
    res.status(500).json({ 
      message: 'Error processing ad approval', 
      error: error.message 
    });
  }
};