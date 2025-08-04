// Create new file: AvailableAdsController.js
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');

exports.getAvailableAds = async (req, res) => {
  try {
    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const { websiteId, categoryId } = req.query;

    // Verify web owner owns the website/category
    const category = await AdCategory.findById(categoryId).populate('websiteId');
    if (!category || category.ownerId !== webOwnerId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // Find available ads that match business categories
    const website = await Website.findById(websiteId);
    const matchingCategories = website.businessCategories.includes('any') 
      ? [] // If 'any', don't filter by business categories
      : website.businessCategories;

    const query = {
      $or: [
        // Ads that were never assigned to any website
        { 'websiteSelections': { $size: 0 } },
        // Ads available for reassignment (rejected or expired)
        { 'availableForReassignment': true },
        // Ads with all selections rejected
        { 
          'websiteSelections': {
            $not: {
              $elemMatch: { 
                approved: true, 
                isRejected: false 
              }
            }
          }
        }
      ],
      confirmed: true // Only show confirmed ads
    };

    // Add business category matching if website has specific categories
    if (matchingCategories.length > 0) {
      query.businessCategories = { $in: matchingCategories };
    }

    const availableAds = await ImportAd.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // Limit for performance

    res.status(200).json({
      success: true,
      availableAds: availableAds,
      category: category
    });

  } catch (error) {
    console.error('Error fetching available ads:', error);
    res.status(500).json({ error: 'Failed to fetch available ads' });
  }
};

exports.assignAdToCategory = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { adId, categoryId, websiteId } = req.body;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    await session.withTransaction(async () => {
      // Verify permissions
      const category = await AdCategory.findById(categoryId).session(session);
      if (!category || category.ownerId !== webOwnerId) {
        throw new Error('Unauthorized access to category');
      }

      // Get the ad
      const ad = await ImportAd.findById(adId).session(session);
      if (!ad) {
        throw new Error('Ad not found');
      }

      // Check if ad is available
      const existingSelection = ad.websiteSelections.find(
        sel => sel.websiteId.toString() === websiteId &&
               sel.categories.includes(categoryId) &&
               sel.approved === true &&
               !sel.isRejected
      );

      if (existingSelection) {
        throw new Error('Ad is already assigned to this category');
      }

      // Add new website selection (free assignment for available ads)
      const rejectionDeadline = new Date();
      rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

      ad.websiteSelections.push({
        websiteId: websiteId,
        categories: [categoryId],
        approved: true,
        approvedAt: new Date(),
        publishedAt: new Date(),
        rejectionDeadline: rejectionDeadline,
        status: 'active'
      });

      ad.availableForReassignment = false; // No longer available for reassignment
      await ad.save({ session });

      // Add to category's selected ads
      await AdCategory.findByIdAndUpdate(
        categoryId,
        { $addToSet: { selectedAds: adId } },
        { session }
      );
    });

    res.status(200).json({
      success: true,
      message: 'Ad assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning ad:', error);
    res.status(400).json({ error: error.message || 'Failed to assign ad' });
  } finally {
    await session.endSession();
  }
};