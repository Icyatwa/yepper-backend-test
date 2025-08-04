// 1. Update WebAdvertiseModel.js - Add rejection fields
const mongoose = require('mongoose');

const importAdSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  adOwnerEmail: { type: String, required: true },
  imageUrl: { type: String },
  pdfUrl: { type: String },
  videoUrl: { type: String },
  businessName: { type: String, required: true },
  businessLink: { type: String, required: true },
  businessLocation: { type: String, required: true },
  adDescription: { type: String, required: true },
  websiteSelections: [{
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AdCategory' }],
    approved: { type: Boolean, default: false },
    approvedAt: { type: Date },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    status: { 
      type: String, 
      enum: ['pending_payment', 'paid', 'active', 'paused', 'expired', 'rejected', 'pending_approval'],
      default: 'pending_payment'
    },
    publishedAt: { type: Date },
    // New rejection fields
    rejectionWindow: { type: Date }, // When the rejection window expires
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    canBeRejected: { type: Boolean, default: true }
  }],
  confirmed: { type: Boolean, default: false },
  clicks: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

importAdSchema.index({ userId: 1, 'websiteSelections.websiteId': 1 });
importAdSchema.index({ 'websiteSelections.rejectionWindow': 1 }); // Index for cleanup job

module.exports = mongoose.model('ImportAd', importAdSchema);

// 2. Update PaymentController.js - Modify verifyPayment to set rejection window
exports.verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { transaction_id, tx_ref } = req.body;
    
    const identifier = transaction_id || tx_ref;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Transaction ID or reference required' });
    }

    const response = await flw.Transaction.verify({ id: identifier });

    if (response.status === 'success' && response.data.status === 'successful') {
      let payment = await Payment.findOne({ 
        $or: [
          { tx_ref: response.data.tx_ref },
          { paymentId: identifier }
        ]
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
      }

      if (payment.status === 'successful') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: payment 
        });
      }

      await session.withTransaction(async () => {
        payment.paymentId = response.data.id;
        payment.status = 'successful';
        payment.paidAt = new Date();
        payment.flutterwaveData.set('verification', response.data);
        await payment.save({ session });

        const ad = await ImportAd.findById(payment.adId).session(session);
        const selectionIndex = ad.websiteSelections.findIndex(
          sel => sel.websiteId.toString() === payment.websiteId.toString() &&
                 sel.categories.includes(payment.categoryId)
        );

        const now = new Date();
        const rejectionWindowEnd = new Date(now.getTime() + 60 * 1000); // 1 minute for testing

        if (selectionIndex !== -1) {
          ad.websiteSelections[selectionIndex].status = 'pending_approval'; // Changed from 'active'
          ad.websiteSelections[selectionIndex].approved = false; // Changed to false initially
          ad.websiteSelections[selectionIndex].publishedAt = now;
          ad.websiteSelections[selectionIndex].paymentId = payment._id;
          ad.websiteSelections[selectionIndex].rejectionWindow = rejectionWindowEnd;
          ad.websiteSelections[selectionIndex].canBeRejected = true;
        } else {
          ad.websiteSelections.push({
            websiteId: payment.websiteId,
            categories: [payment.categoryId],
            approved: false, // Initially false
            publishedAt: now,
            paymentId: payment._id,
            status: 'pending_approval',
            rejectionWindow: rejectionWindowEnd,
            canBeRejected: true
          });
        }

        await ad.save({ session });

        // Add ad to category's selectedAds
        await AdCategory.findByIdAndUpdate(
          payment.categoryId,
          { $addToSet: { selectedAds: payment.adId } },
          { session }
        );

        // Update wallet (same as before)
        let wallet = await Wallet.findOne({ ownerId: payment.webOwnerId }).session(session);
        
        if (!wallet) {
          const website = await Website.findById(payment.websiteId).session(session);
          const category = await AdCategory.findById(payment.categoryId).session(session);
          
          const ownerEmail = category.webOwnerEmail;
          
          if (!ownerEmail) {
            throw new Error('Website owner email not found');
          }
          
          wallet = new Wallet({
            ownerId: payment.webOwnerId,
            ownerEmail: ownerEmail,
            balance: 0,
            totalEarned: 0
          });
        }

        wallet.balance += payment.amount;
        wallet.totalEarned += payment.amount;
        wallet.lastUpdated = new Date();
        await wallet.save({ session });

        const walletTransaction = new WalletTransaction({
          walletId: wallet._id,
          paymentId: payment._id,
          adId: payment.adId,
          amount: payment.amount,
          type: 'credit',
          description: `Payment for ad: ${ad.businessName} on category: ${payment.categoryId}`
        });

        await walletTransaction.save({ session });
      });

      res.status(200).json({
        success: true,
        message: 'Payment verified. Ad is now live with 1-minute rejection window.',
        payment: payment,
        rejectionWindowEnd: rejectionWindowEnd
      });

    } else {
      // Payment failed logic (same as before)
      await Payment.findOneAndUpdate(
        { 
          $or: [
            { tx_ref: identifier },
            { paymentId: identifier },
            { tx_ref: response.data?.tx_ref }
          ]
        },
        { 
          status: 'failed',
          flutterwaveData: response.data 
        }
      );

      res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed',
        details: response.data 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  } finally {
    await session.endSession();
  }
};

// 3. Create AdRejectionController.js - New controller for rejection functionality
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const Payment = require('../models/PaymentModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/WalletModel');
const mongoose = require('mongoose');

exports.rejectAd = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { adId, websiteId, categoryId, rejectionReason } = req.body;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    // Verify the user owns the website
    const website = await Website.findOne({ 
      _id: websiteId, 
      ownerId: webOwnerId 
    });

    if (!website) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this website' });
    }

    const ad = await ImportAd.findById(adId);
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const selection = ad.websiteSelections.find(
      sel => sel.websiteId.toString() === websiteId &&
             sel.categories.includes(categoryId)
    );

    if (!selection) {
      return res.status(404).json({ error: 'Ad selection not found for this website/category' });
    }

    // Check if rejection window is still open
    const now = new Date();
    if (now > selection.rejectionWindow) {
      return res.status(400).json({ 
        error: 'Rejection window has expired. Ad cannot be rejected.' 
      });
    }

    if (!selection.canBeRejected) {
      return res.status(400).json({ error: 'This ad cannot be rejected' });
    }

    if (selection.status === 'rejected') {
      return res.status(400).json({ error: 'Ad is already rejected' });
    }

    await session.withTransaction(async () => {
      // Update ad selection status
      selection.status = 'rejected';
      selection.rejectedAt = now;
      selection.rejectionReason = rejectionReason || 'Rejected by website owner';
      selection.canBeRejected = false;
      selection.approved = false;

      await ad.save({ session });

      // Find the payment
      const payment = await Payment.findById(selection.paymentId).session(session);
      if (!payment) {
        throw new Error('Payment record not found');
      }

      // Reverse wallet transaction for web owner
      const webOwnerWallet = await Wallet.findOne({ ownerId: webOwnerId }).session(session);
      if (webOwnerWallet && webOwnerWallet.balance >= payment.amount) {
        webOwnerWallet.balance -= payment.amount;
        webOwnerWallet.lastUpdated = now;
        await webOwnerWallet.save({ session });

        // Create reversal transaction
        const reversalTransaction = new WalletTransaction({
          walletId: webOwnerWallet._id,
          paymentId: payment._id,
          adId: adId,
          amount: -payment.amount, // Negative amount for reversal
          type: 'debit',
          description: `Refund for rejected ad: ${ad.businessName} - ${rejectionReason || 'No reason provided'}`
        });

        await reversalTransaction.save({ session });
      }

      // Create/update advertiser's ad budget wallet
      let advertiserWallet = await Wallet.findOne({ ownerId: ad.userId }).session(session);
      
      if (!advertiserWallet) {
        advertiserWallet = new Wallet({
          ownerId: ad.userId,
          ownerEmail: ad.adOwnerEmail,
          balance: 0,
          totalEarned: 0
        });
      }

      advertiserWallet.balance += payment.amount;
      advertiserWallet.lastUpdated = now;
      await advertiserWallet.save({ session });

      // Create refund transaction for advertiser
      const refundTransaction = new WalletTransaction({
        walletId: advertiserWallet._id,
        paymentId: payment._id,
        adId: adId,
        amount: payment.amount,
        type: 'credit',
        description: `Refund for rejected ad: ${ad.businessName} on ${website.websiteName}`
      });

      await refundTransaction.save({ session });

      // Remove ad from category's selectedAds
      await AdCategory.findByIdAndUpdate(
        categoryId,
        { $pull: { selectedAds: adId } },
        { session }
      );

      // Remove the rejected selection from the ad instead of keeping it
      ad.websiteSelections = ad.websiteSelections.filter(
        sel => !(sel.websiteId.toString() === websiteId && 
                sel.categories.includes(categoryId))
      );

      // If no more selections, mark ad as available for new selections
      if (ad.websiteSelections.length === 0) {
        ad.confirmed = false; // Reset confirmed status
      }

      await ad.save({ session });

      // Update payment status
      payment.status = 'refunded';
      await payment.save({ session });
    });

    res.status(200).json({
      success: true,
      message: 'Ad rejected successfully and payment refunded',
      rejectionReason: rejectionReason || 'Rejected by website owner'
    });

  } catch (error) {
    console.error('Ad rejection error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  } finally {
    await session.endSession();
  }
};

exports.getWebsiteAdsForReview = async (req, res) => {
  try {
    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const { websiteId } = req.params;

    // Verify ownership
    const website = await Website.findOne({ 
      _id: websiteId, 
      ownerId: webOwnerId 
    });

    if (!website) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this website' });
    }

    // Get all ads pending approval for this website
    const ads = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          websiteId: websiteId,
          status: 'pending_approval',
          canBeRejected: true,
          rejectionWindow: { $gt: new Date() } // Still within rejection window
        }
      }
    }).populate('websiteSelections.categories');

    const adsForReview = ads.map(ad => {
      const selection = ad.websiteSelections.find(
        sel => sel.websiteId.toString() === websiteId &&
               sel.status === 'pending_approval'
      );

      return {
        adId: ad._id,
        businessName: ad.businessName,
        businessLocation: ad.businessLocation,
        adDescription: ad.adDescription,
        imageUrl: ad.imageUrl,
        videoUrl: ad.videoUrl,
        pdfUrl: ad.pdfUrl,
        businessLink: ad.businessLink,
        publishedAt: selection.publishedAt,
        rejectionWindow: selection.rejectionWindow,
        timeRemaining: Math.max(0, Math.floor((selection.rejectionWindow - new Date()) / 1000)), // seconds
        categoryId: selection.categories[0], // Assuming one category per selection
        paymentId: selection.paymentId
      };
    });

    res.status(200).json({
      success: true,
      ads: adsForReview,
      website: {
        id: website._id,
        name: website.websiteName,
        url: website.websiteUrl
      }
    });

  } catch (error) {
    console.error('Error fetching ads for review:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// 4. Create scheduled job - AdApprovalJob.js
const cron = require('node-cron');
const ImportAd = require('../models/WebAdvertiseModel');
const mongoose = require('mongoose');

// Function to auto-approve ads after rejection window expires
const autoApproveExpiredAds = async () => {
  const session = await mongoose.startSession();
  
  try {
    console.log('Running auto-approval job for expired rejection windows...');
    
    const now = new Date();
    
    await session.withTransaction(async () => {
      // Find all ads with expired rejection windows that are still pending approval
      const adsToApprove = await ImportAd.find({
        'websiteSelections': {
          $elemMatch: {
            status: 'pending_approval',
            rejectionWindow: { $lt: now },
            canBeRejected: true
          }
        }
      }).session(session);

      let approvedCount = 0;

      for (const ad of adsToApprove) {
        let adModified = false;
        
        for (const selection of ad.websiteSelections) {
          if (
            selection.status === 'pending_approval' &&
            selection.rejectionWindow < now &&
            selection.canBeRejected
          ) {
            selection.status = 'active';
            selection.approved = true;
            selection.approvedAt = now;
            selection.canBeRejected = false;
            adModified = true;
            approvedCount++;
          }
        }

        if (adModified) {
          // Check if all selections are now approved
          const allApproved = ad.websiteSelections.every(sel => sel.approved);
          if (allApproved) {
            ad.confirmed = true;
          }
          
          await ad.save({ session });
        }
      }

      console.log(`Auto-approved ${approvedCount} ad selections`);
    });

  } catch (error) {
    console.error('Error in auto-approval job:', error);
  } finally {
    await session.endSession();
  }
};

// Run every 30 seconds for testing (adjust as needed)
const scheduleAutoApproval = () => {
  cron.schedule('*/30 * * * * *', autoApproveExpiredAds);
  console.log('Auto-approval job scheduled to run every 30 seconds');
};

module.exports = {
  autoApproveExpiredAds,
  scheduleAutoApproval
};

// 5. Update AdDisplayController.js - Only show approved/active ads
exports.displayAd = async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { categoryId } = req.query;
    
    const adCategory = await AdCategory.findById(categoryId);
    
    // Only show ads that are approved and active (not pending_approval or rejected)
    const ads = await ImportAd.find({
      _id: { $in: adCategory.selectedAds },
      'websiteSelections': {
        $elemMatch: {
          websiteId: adCategory.websiteId,
          categories: categoryId,
          status: 'active', // Must be active
          approved: true    // Must be approved
        }
      },
      'confirmed': true
    });

    if (!ads || ads.length === 0) {
      return res.json({ html: getNoAdsHtml() });
    }

    const adsToShow = ads.slice(0, adCategory.userCount || ads.length);

    // Rest of the display logic remains the same...
    const adsHtml = adsToShow
      .map((ad) => {
        if (!ad) return '';

        try {
          const websiteSelection = ad.websiteSelections.find(
            sel => sel.websiteId.toString() === adCategory.websiteId.toString() &&
                  sel.approved && sel.status === 'active'
          );

          if (!websiteSelection) return ''; // Double check

          const imageUrl = ad.imageUrl || 'https://via.placeholder.com/600x300';
          const targetUrl = ad.businessLink.startsWith('http') ? 
            ad.businessLink : `https://${ad.businessLink}`;
          
          const description = ad.businessDescription || 
                            ad.productDescription || 
                            `Visit ${ad.businessName} for great products and services.`;
          
          const shortDescription = description.length > 80 ? 
            description.substring(0, 80) + '...' : description;

          return `
            <div class="yepper-ad-item" 
                  data-ad-id="${ad._id}"
                  data-category-id="${categoryId}"
                  data-website-id="${adCategory.websiteId}">
              <div class="yepper-ad-header">
                <span class="yepper-ad-header-logo">Yepper Ad</span>
                <span class="yepper-ad-header-badge">Sponsored</span>
              </div>
              
              <a href="${targetUrl}" 
                  class="yepper-ad-link" 
                  target="_blank" 
                  rel="noopener"
                  data-tracking="true">
                <div class="yepper-ad-content">
                  <div class="yepper-ad-image-wrapper">
                    <img class="yepper-ad-image" src="${imageUrl}" alt="${ad.businessName}" loading="lazy">
                  </div>
                  
                  <h3 class="yepper-ad-business-name">${ad.businessName}</h3>
                  
                  <p class="yepper-ad-description">${shortDescription}</p>
                  
                  <div class="yepper-ad-cta">
                    Learn More →
                  </div>
                </div>
              </a>
              
              <div class="yepper-ad-footer">
                <span class="yepper-ad-footer-brand">Powered by Yepper</span>
                <span class="yepper-ad-footer-business">by ${ad.businessName}</span>
              </div>
            </div>
          `;
        } catch (error) {
          return '';
        }
      })
      .filter(html => html)
      .join('');

    const finalHtml = `<div class="yepper-ad-container">${adsHtml}</div>`;
    return res.json({ html: finalHtml });
  } catch (error) {
    return res.json({ html: getNoAdsHtml() });
  }
};

function getNoAdsHtml() {
  return `
    <div class="yepper-ad-container">
      <div class="yepper-no-ads">
        <p>No ads available at the moment.</p>
      </div>
    </div>
  `;
}

// 8. Create AdMarketplaceController.js - For website owners to discover and add available ads
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const Payment = require('../models/PaymentModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/WalletModel');
const mongoose = require('mongoose');

// Get available ads that website owners can add to their categories
exports.getAvailableAds = async (req, res) => {
  try {
    const { categoryId, websiteId } = req.query;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    // Verify the user owns the website/category
    let query = {};
    if (websiteId && categoryId) {
      const website = await Website.findOne({ _id: websiteId, ownerId: webOwnerId });
      const category = await AdCategory.findOne({ _id: categoryId, ownerId: webOwnerId });
      
      if (!website || !category) {
        return res.status(403).json({ error: 'Unauthorized: You do not own this website/category' });
      }
    }

    // Find ads that:
    // 1. Have budget available (advertisers have money to spend)
    // 2. Are not currently active on any site OR have been rejected and are available again
    // 3. Are confirmed (basic ad creation is complete)
    const availableAds = await ImportAd.find({
      $or: [
        // Ads with no website selections (newly created or all rejected)
        { websiteSelections: { $size: 0 } },
        // Ads where all selections are rejected/expired and budget is available
        { 
          websiteSelections: { 
            $not: { 
              $elemMatch: { 
                status: { $in: ['active', 'pending_approval', 'paid'] } 
              } 
            } 
          } 
        }
      ]
    }).select('-websiteSelections'); // Don't include selections in marketplace view

    // Get advertiser wallet info to show available budget
    const adsWithBudget = await Promise.all(availableAds.map(async (ad) => {
      const advertiserWallet = await Wallet.findOne({ ownerId: ad.userId });
      
      return {
        _id: ad._id,
        businessName: ad.businessName,
        businessLocation: ad.businessLocation,
        adDescription: ad.adDescription,
        imageUrl: ad.imageUrl,
        videoUrl: ad.videoUrl,
        pdfUrl: ad.pdfUrl,
        businessLink: ad.businessLink,
        adOwnerEmail: ad.adOwnerEmail,
        createdAt: ad.createdAt,
        availableBudget: advertiserWallet ? advertiserWallet.balance : 0,
        clicks: ad.clicks,
        views: ad.views
      };
    }));

    // Filter ads that have sufficient budget (at least some money available)
    const fundedAds = adsWithBudget.filter(ad => ad.availableBudget > 0);

    res.status(200).json({
      success: true,
      ads: fundedAds,
      totalCount: fundedAds.length
    });

  } catch (error) {
    console.error('Error fetching available ads:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// Website owner claims an ad for their category
exports.claimAdForCategory = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { adId, categoryId } = req.body;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    // Verify ownership of category
    const category = await AdCategory.findOne({ 
      _id: categoryId, 
      ownerId: webOwnerId 
    }).populate('websiteId');

    if (!category) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this category' });
    }

    const websiteId = category.websiteId._id;
    const ad = await ImportAd.findById(adId);
    
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    // Check if ad is already active on this website/category
    const existingSelection = ad.websiteSelections.find(
      sel => sel.websiteId.toString() === websiteId.toString() &&
             sel.categories.includes(categoryId) &&
             ['active', 'pending_approval', 'paid'].includes(sel.status)
    );

    if (existingSelection) {
      return res.status(400).json({ error: 'Ad is already active or pending on this category' });
    }

    // Check advertiser's budget
    const advertiserWallet = await Wallet.findOne({ ownerId: ad.userId });
    if (!advertiserWallet || advertiserWallet.balance < category.price) {
      return res.status(400).json({ 
        error: 'Insufficient budget',
        required: category.price,
        available: advertiserWallet ? advertiserWallet.balance : 0
      });
    }

    await session.withTransaction(async () => {
      // Create payment record
      const payment = new Payment({
        paymentId: `marketplace_${adId}_${websiteId}_${categoryId}_${Date.now()}`,
        tx_ref: `marketplace_${Date.now()}`,
        adId: adId,
        advertiserId: ad.userId,
        webOwnerId: webOwnerId,
        websiteId: websiteId,
        categoryId: categoryId,
        amount: category.price,
        status: 'successful', // Direct deduction from budget
        paidAt: new Date(),
        paymentMethod: 'budget_deduction'
      });

      await payment.save({ session });

      // Deduct from advertiser's wallet
      advertiserWallet.balance -= category.price;
      advertiserWallet.lastUpdated = new Date();
      await advertiserWallet.save({ session });

      // Create debit transaction for advertiser
      const advertiserTransaction = new WalletTransaction({
        walletId: advertiserWallet._id,
        paymentId: payment._id,
        adId: adId,
        amount: -category.price,
        type: 'debit',
        description: `Payment for ad placement on ${category.websiteId.websiteName} - ${category.categoryName}`
      });

      await advertiserTransaction.save({ session });

      // Add to web owner's wallet
      let webOwnerWallet = await Wallet.findOne({ ownerId: webOwnerId }).session(session);
      
      if (!webOwnerWallet) {
        webOwnerWallet = new Wallet({
          ownerId: webOwnerId,
          ownerEmail: category.webOwnerEmail,
          balance: 0,
          totalEarned: 0
        });
      }

      webOwnerWallet.balance += category.price;
      webOwnerWallet.totalEarned += category.price;
      webOwnerWallet.lastUpdated = new Date();
      await webOwnerWallet.save({ session });

      // Create credit transaction for web owner
      const webOwnerTransaction = new WalletTransaction({
        walletId: webOwnerWallet._id,
        paymentId: payment._id,
        adId: adId,
        amount: category.price,
        type: 'credit',
        description: `Earnings from ad: ${ad.businessName} on ${category.categoryName}`
      });

      await webOwnerTransaction.save({ session });

      // Add selection to ad with 1-minute rejection window
      const now = new Date();
      const rejectionWindowEnd = new Date(now.getTime() + 60 * 1000);

      ad.websiteSelections.push({
        websiteId: websiteId,
        categories: [categoryId],
        approved: false,
        publishedAt: now,
        paymentId: payment._id,
        status: 'pending_approval',
        rejectionWindow: rejectionWindowEnd,
        canBeRejected: true
      });

      await ad.save({ session });

      // Add ad to category's selectedAds
      await AdCategory.findByIdAndUpdate(
        categoryId,
        { $addToSet: { selectedAds: adId } },
        { session }
      );
    });

    res.status(200).json({
      success: true,
      message: 'Ad successfully added to your category! You have 1 minute to reject if needed.',
      payment: {
        amount: category.price,
        categoryName: category.categoryName,
        websiteName: category.websiteId.websiteName
      },
      rejectionWindowEnd: new Date(Date.now() + 60 * 1000)
    });

  } catch (error) {
    console.error('Error claiming ad:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  } finally {
    await session.endSession();
  }
};

// Get advertiser's budget and spending history
exports.getAdvertiserBudget = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    const wallet = await Wallet.findOne({ ownerId: userId });
    const ads = await ImportAd.find({ userId: userId })
      .populate('websiteSelections.websiteId', 'websiteName')
      .populate('websiteSelections.categories', 'categoryName price');

    const activeAds = ads.filter(ad => 
      ad.websiteSelections.some(sel => sel.status === 'active')
    );

    const pendingAds = ads.filter(ad => 
      ad.websiteSelections.some(sel => sel.status === 'pending_approval')
    );

    const availableAds = ads.filter(ad => 
      ad.websiteSelections.length === 0 || 
      ad.websiteSelections.every(sel => ['rejected', 'expired'].includes(sel.status))
    );

    res.status(200).json({
      success: true,
      budget: {
        available: wallet ? wallet.balance : 0,
        totalSpent: wallet ? wallet.totalEarned : 0
      },
      adStats: {
        total: ads.length,
        active: activeAds.length,
        pending: pendingAds.length,
        available: availableAds.length
      },
      ads: {
        active: activeAds,
        pending: pendingAds,
        available: availableAds
      }
    });

  } catch (error) {
    console.error('Error fetching advertiser budget:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// routes/adRejection.js
const express = require('express');
const router = express.Router();
const AdRejectionController = require('../controllers/AdRejectionController');
const authenticateToken = require('../middleware/authenticateToken'); // Your auth middleware

// Reject an ad
router.post('/reject', authenticateToken, AdRejectionController.rejectAd);

// Get ads pending review for a website
router.get('/website/:websiteId/pending', authenticateToken, AdRejectionController.getWebsiteAdsForReview);

module.exports = router;

// 7. Initialize the scheduler in your main app file (app.js or server.js)
// Add this to your main application file:
const { scheduleAutoApproval } = require('./jobs/AdApprovalJob');

// Start the auto-approval scheduler
scheduleAutoApproval();