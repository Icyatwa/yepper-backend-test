// AdRejectionController.js
const mongoose = require('mongoose');
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const AdCategory = require('../models/CreateCategoryModel');
const Payment = require('../../AdOwner/models/PaymentModel');
const { Wallet, WalletTransaction } = require('../models/walletModel');

exports.rejectAd = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { adId, websiteId, categoryId } = req.params;
    const { rejectionReason } = req.body;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    await session.withTransaction(async () => {
      // Find the ad and verify web owner permissions
      const ad = await ImportAd.findById(adId).session(session);
      if (!ad) {
        throw new Error('Ad not found');
      }

      // Find the specific website selection
      const selectionIndex = ad.websiteSelections.findIndex(
        sel => sel.websiteId.toString() === websiteId && 
               sel.categories.includes(categoryId) &&
               sel.approved === true &&
               !sel.isRejected
      );

      if (selectionIndex === -1) {
        throw new Error('Ad selection not found or already processed');
      }

      const selection = ad.websiteSelections[selectionIndex];

      // Check if rejection window is still open (2 minutes)
      const now = new Date();
      if (selection.rejectionDeadline && now > selection.rejectionDeadline) {
        throw new Error('Rejection window has expired');
      }

      // Verify web owner owns this website/category
      const category = await AdCategory.findById(categoryId).session(session);
      if (!category || category.ownerId !== webOwnerId) {
        throw new Error('Unauthorized: You do not own this ad space');
      }

      // Find the payment record
      const payment = await Payment.findOne({
        adId: adId,
        websiteId: websiteId,
        categoryId: categoryId,
        status: 'successful'
      }).session(session);

      if (!payment) {
        throw new Error('Payment record not found');
      }

      // Update ad selection status
      ad.websiteSelections[selectionIndex].isRejected = true;
      ad.websiteSelections[selectionIndex].rejectedAt = now;
      ad.websiteSelections[selectionIndex].rejectedBy = webOwnerId;
      ad.websiteSelections[selectionIndex].rejectionReason = rejectionReason || 'No reason provided';
      ad.websiteSelections[selectionIndex].approved = false;
      ad.websiteSelections[selectionIndex].status = 'rejected';

      // Make ad available for reassignment
      ad.availableForReassignment = true;

      await ad.save({ session });

      // Remove ad from category's selectedAds
      await AdCategory.findByIdAndUpdate(
        categoryId,
        { $pull: { selectedAds: adId } },
        { session }
      );

      // Reverse wallet transaction for web owner
      const webOwnerWallet = await Wallet.findOne({ ownerId: webOwnerId }).session(session);
      if (webOwnerWallet) {
        webOwnerWallet.balance -= payment.amount;
        webOwnerWallet.totalEarned -= payment.amount;
        webOwnerWallet.lastUpdated = now;
        await webOwnerWallet.save({ session });

        // Create reversal transaction record
        const reversalTransaction = new WalletTransaction({
          walletId: webOwnerWallet._id,
          paymentId: payment._id,
          adId: adId,
          amount: -payment.amount,
          type: 'debit',
          description: `Refund for rejected ad: ${ad.businessName} from category: ${categoryId}`
        });
        await reversalTransaction.save({ session });
      }

      // Update payment status
      payment.status = 'refunded';
      payment.refundedAt = now;
      payment.refundReason = 'Ad rejected by web owner';
      await payment.save({ session });
    });

    res.status(200).json({
      success: true,
      message: 'Ad rejected successfully and refund processed'
    });

  } catch (error) {
    console.error('Ad rejection error:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to reject ad' 
    });
  } finally {
    await session.endSession();
  }
};

// Get ads pending rejection (for web owner dashboard)
exports.getPendingRejections = async (req, res) => {
  try {
    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const now = new Date();

    // Find categories owned by this web owner
    const categories = await AdCategory.find({ ownerId: webOwnerId });
    const categoryIds = categories.map(cat => cat._id);

    // Find ads with pending rejection windows
    const pendingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          categories: { $in: categoryIds },
          approved: true,
          isRejected: false,
          rejectionDeadline: { $gt: now }
        }
      }
    }).populate('websiteSelections.websiteId');

    res.status(200).json({
      success: true,
      pendingAds: pendingAds
    });

  } catch (error) {
    console.error('Error fetching pending rejections:', error);
    res.status(500).json({ error: 'Failed to fetch pending rejections' });
  }
};