// MarketplaceController.js
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/walletModel');
const mongoose = require('mongoose');

// Get marketplace ads
exports.getMarketplaceAds = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      minBudget, 
      maxBudget,
      search 
    } = req.query;

    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const userWebsites = await Website.find({ ownerId: webOwnerId }).select('_id');
    const websiteIds = userWebsites.map(w => w._id);

    let query = {
      isMarketplace: true,
      budget: { $gt: 0 },
      // Exclude ads already rejected by this user's websites
      'rejectedWebsites.websiteId': { $nin: websiteIds }
    };

    if (category) {
      const categories = await AdCategory.find({ 
        categoryName: new RegExp(category, 'i'),
        websiteId: { $in: websiteIds }
      });
      query.marketplacePrice = { $lte: Math.max(...categories.map(c => c.price)) };
    }

    if (minBudget) query.budget.$gte = parseFloat(minBudget);
    if (maxBudget) query.budget.$lte = parseFloat(maxBudget);
    if (search) {
      query.$or = [
        { businessName: new RegExp(search, 'i') },
        { adDescription: new RegExp(search, 'i') },
        { businessLocation: new RegExp(search, 'i') }
      ];
    }

    const ads = await ImportAd.find(query)
      .select('businessName adDescription businessLocation imageUrl budget marketplacePrice createdAt clicks views')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await ImportAd.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        ads,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch marketplace ads', 
      message: error.message 
    });
  }
};

// Get compatible categories for an ad
exports.getCompatibleCategories = async (req, res) => {
  try {
    const { adId } = req.params;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    const ad = await ImportAd.findById(adId);
    if (!ad || !ad.isMarketplace) {
      return res.status(404).json({ error: 'Marketplace ad not found' });
    }

    const userWebsites = await Website.find({ ownerId: webOwnerId });
    const websiteIds = userWebsites.map(w => w._id);

    // Get categories where price <= ad budget
    const categories = await AdCategory.find({
      websiteId: { $in: websiteIds },
      price: { $lte: ad.budget }
    }).populate('websiteId', 'websiteName websiteUrl');

    const categoriesByWebsite = {};
    categories.forEach(category => {
      const websiteId = category.websiteId._id.toString();
      if (!categoriesByWebsite[websiteId]) {
        categoriesByWebsite[websiteId] = {
          website: category.websiteId,
          categories: []
        };
      }
      categoriesByWebsite[websiteId].categories.push(category);
    });

    res.status(200).json({
      success: true,
      data: {
        ad,
        websiteCategories: Object.values(categoriesByWebsite)
      }
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch compatible categories', 
      message: error.message 
    });
  }
};

// Get ads pending review for web owner
exports.getPendingReviewAds = async (req, res) => {
  try {
    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const websites = await Website.find({ ownerId: webOwnerId });
    const websiteIds = websites.map(w => w._id);

    const ads = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          websiteId: { $in: websiteIds },
          status: 'active',
          approved: false,
          rejectionDeadline: { $gt: new Date() }
        }
      }
    })
    .populate('websiteSelections.websiteId', 'websiteName')
    .populate('websiteSelections.categories', 'categoryName price')
    .lean();

    const pendingAds = ads.map(ad => {
      const relevantSelections = ad.websiteSelections.filter(sel => 
        websiteIds.some(id => id.toString() === sel.websiteId._id.toString()) &&
        sel.status === 'active' && 
        !sel.approved &&
        new Date() < sel.rejectionDeadline
      );

      return {
        ...ad,
        websiteSelections: relevantSelections,
        timeLeft: relevantSelections.length > 0 ? 
          relevantSelections[0].rejectionDeadline - new Date() : 0
      };
    }).filter(ad => ad.websiteSelections.length > 0);

    res.status(200).json({
      success: true,
      data: pendingAds
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch pending ads', 
      message: error.message 
    });
  }
};

// Process expired rejection deadlines
exports.processExpiredDeadlines = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const expiredAds = await ImportAd.find({
        'websiteSelections': {
          $elemMatch: {
            status: 'active',
            approved: false,
            rejectionDeadline: { $lte: new Date() }
          }
        }
      }).session(session);

      for (const ad of expiredAds) {
        let adChanged = false;
        
        for (const selection of ad.websiteSelections) {
          if (selection.status === 'active' && 
              !selection.approved && 
              new Date() >= selection.rejectionDeadline) {
            
            selection.approved = true;
            selection.approvedAt = new Date();
            adChanged = true;

            // Add to web owner's wallet
            let wallet = await Wallet.findOne({ 
              ownerId: (await Website.findById(selection.websiteId).session(session)).ownerId 
            }).session(session);
            
            if (!wallet) {
              const website = await Website.findById(selection.websiteId).session(session);
              const category = await AdCategory.findById(selection.categories[0]).session(session);
              wallet = new Wallet({
                ownerId: website.ownerId,
                ownerEmail: category.webOwnerEmail,
                balance: 0,
                totalEarned: 0
              });
            }

            const amount = (await AdCategory.findById(selection.categories[0]).session(session)).price;
            wallet.balance += amount;
            wallet.totalEarned += amount;
            wallet.lastUpdated = new Date();
            await wallet.save({ session });

            // Create wallet transaction
            const walletTransaction = new WalletTransaction({
              walletId: wallet._id,
              paymentId: selection.paymentId,
              adId: ad._id,
              amount: amount,
              type: 'credit',
              description: `Auto-approved ad: ${ad.businessName}`
            });
            await walletTransaction.save({ session });
          }
        }

        if (adChanged) {
          const allApproved = ad.websiteSelections.every(sel => sel.approved || sel.status !== 'active');
          if (allApproved) {
            ad.confirmed = true;
          }
          await ad.save({ session });
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Expired deadlines processed successfully'
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to process expired deadlines', 
      message: error.message 
    });
  } finally {
    await session.endSession();
  }
};