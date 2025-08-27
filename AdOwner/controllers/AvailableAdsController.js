// AvailableAdsController.js
const mongoose = require('mongoose');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const Payment = require('../../AdOwner/models/PaymentModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/walletModel');

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

    // Get available ads with payment information
    const availableAds = await ImportAd.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // Limit for performance

    // Enrich ads with payment information
    const adsWithPaymentInfo = await Promise.all(
      availableAds.map(async (ad) => {
        // Find the most recent payment for this ad and category combination
        const payment = await Payment.findOne({
          adId: ad._id,
          categoryId: categoryId,
          status: { $in: ['successful', 'refunded'] }
        }).sort({ createdAt: -1 });

        return {
          ...ad.toObject(),
          potentialEarning: payment ? payment.amount : category.price,
          paymentInfo: payment
        };
      })
    );

    res.status(200).json({
      success: true,
      availableAds: adsWithPaymentInfo,
      category: category
    });

  } catch (error) {
    console.error('Error fetching available ads:', error);
    res.status(500).json({ error: 'Failed to fetch available ads' });
  }
};

exports.assignAdToCategoryWithPayment = async (req, res) => {
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
      const existingActiveSelection = ad.websiteSelections.find(
        sel => sel.websiteId.toString() === websiteId &&
               sel.categories.includes(categoryId) &&
               sel.approved === true &&
               !sel.isRejected
      );

      if (existingActiveSelection) {
        throw new Error('Ad is already assigned to this category');
      }

      // Find the most recent payment for this ad (could be from previous assignment)
      let payment = await Payment.findOne({
        adId: adId,
        status: { $in: ['successful', 'refunded'] }
      }).sort({ createdAt: -1 }).session(session);

      let earningAmount = category.price; // Default to category price

      // If there's a previous payment, use that amount
      if (payment) {
        earningAmount = payment.amount;
        
        // Create a new payment record for this assignment
        const newPayment = new Payment({
          adId: adId,
          websiteId: websiteId,
          categoryId: categoryId,
          amount: earningAmount,
          status: 'successful',
          paymentMethod: 'reassignment',
          description: `Payment for reassigned ad: ${ad.businessName}`,
          adOwnerEmail: ad.adOwnerEmail,
          webOwnerEmail: category.webOwnerEmail,
          createdAt: new Date()
        });
        
        payment = await newPayment.save({ session });
      } else {
        // Create new payment record
        payment = new Payment({
          adId: adId,
          websiteId: websiteId,
          categoryId: categoryId,
          amount: earningAmount,
          status: 'successful',
          paymentMethod: 'reassignment',
          description: `Payment for assigned ad: ${ad.businessName}`,
          adOwnerEmail: ad.adOwnerEmail,
          webOwnerEmail: category.webOwnerEmail,
          createdAt: new Date()
        });
        
        payment = await payment.save({ session });
      }

      // Set up rejection deadline (2 minutes from now)
      const rejectionDeadline = new Date();
      rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

      // Add new website selection
      ad.websiteSelections.push({
        websiteId: websiteId,
        categories: [categoryId],
        approved: true,
        approvedAt: new Date(),
        publishedAt: new Date(),
        rejectionDeadline: rejectionDeadline,
        status: 'active',
        paymentId: payment._id
      });

      ad.availableForReassignment = false; // No longer available for reassignment
      await ad.save({ session });

      // Add to category's selected ads
      await AdCategory.findByIdAndUpdate(
        categoryId,
        { $addToSet: { selectedAds: adId } },
        { session }
      );

      // Handle wallet payment to web owner
      let webOwnerWallet = await Wallet.findOne({ ownerId: webOwnerId }).session(session);
      
      if (!webOwnerWallet) {
        // Create wallet if it doesn't exist
        webOwnerWallet = new Wallet({
          ownerId: webOwnerId,
          balance: 0,
          totalEarned: 0,
          totalWithdrawn: 0,
          lastUpdated: new Date()
        });
      }

      // Add earnings to wallet
      webOwnerWallet.balance += earningAmount;
      webOwnerWallet.totalEarned += earningAmount;
      webOwnerWallet.lastUpdated = new Date();
      await webOwnerWallet.save({ session });

      // Create wallet transaction record
      const walletTransaction = new WalletTransaction({
        walletId: webOwnerWallet._id,
        paymentId: payment._id,
        adId: adId,
        amount: earningAmount,
        type: 'credit',
        status: 'completed',
        description: `Earnings from ad assignment: ${ad.businessName} - Category: ${category.categoryName}`,
        createdAt: new Date()
      });
      
      await walletTransaction.save({ session });

      // Return success with payment details
      res.status(200).json({
        success: true,
        message: 'Ad assigned successfully and payment credited to wallet',
        paymentDetails: {
          amount: earningAmount,
          paymentId: payment._id,
          walletBalance: webOwnerWallet.balance
        },
        adDetails: {
          adId: adId,
          businessName: ad.businessName,
          rejectionDeadline: rejectionDeadline
        }
      });
    });

  } catch (error) {
    console.error('Error assigning ad with payment:', error);
    res.status(400).json({ error: error.message || 'Failed to assign ad' });
  } finally {
    await session.endSession();
  }
};

// Keep the original method for backward compatibility
exports.assignAdToCategory = exports.assignAdToCategoryWithPayment;