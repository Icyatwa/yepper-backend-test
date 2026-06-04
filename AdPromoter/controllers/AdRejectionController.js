// AdRejectionController.js
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const AdCategory = require('../models/CreateCategoryModel');
const Payment = require('../../AdOwner/models/PaymentModel');
const { Wallet, WalletTransaction } = require('../models/walletModel');

const { getClient } = require('../../config/db'); // for manual PG transactions

exports.rejectAd = async (req, res) => {
  const client = await getClient();
  try {
    const { adId, websiteId, categoryId } = req.params;
    const { rejectionReason } = req.body;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    await client.query('BEGIN');

    const ad = await ImportAd.findById(adId);
    if (!ad) throw new Error('Ad not found');

    const websiteSelections = ad.website_selections || [];
    const selectionIndex = websiteSelections.findIndex(
      sel => sel.websiteId === websiteId &&
             sel.categories?.includes(categoryId) &&
             sel.approved === true &&
             !sel.isRejected
    );
    if (selectionIndex === -1) throw new Error('Ad selection not found or already processed');

    const selection = websiteSelections[selectionIndex];
    const now = new Date();
    if (selection.rejectionDeadline && now > new Date(selection.rejectionDeadline)) {
      throw new Error('Rejection window has expired');
    }

    const category = await AdCategory.findById(categoryId);
    if (!category || category.owner_id !== webOwnerId) {
      throw new Error('Unauthorized: You do not own this ad space');
    }

    const payment = await Payment.findByAd(adId);
    const activePayment = payment.find(p =>
      p.website_id === websiteId && p.category_id === categoryId && p.status === 'successful'
    );
    if (!activePayment) throw new Error('Payment record not found');

    // Update the selection in place
    websiteSelections[selectionIndex] = {
      ...selection,
      isRejected: true, rejectedAt: now, rejectedBy: webOwnerId,
      rejectionReason: rejectionReason || 'No reason provided',
      approved: false, status: 'rejected'
    };
    await ImportAd.update(adId, {
      websiteSelections,
      availableForReassignment: true
    });

    // Reverse wallet earnings
    const wallet = await Wallet.findByOwnerId(webOwnerId);
    if (wallet) {
      await Wallet.update(wallet.id, {
        balance: wallet.balance - activePayment.amount,
        total_earned: wallet.total_earned - activePayment.amount
      });
      await WalletTransaction.create({
        walletId: wallet.id, paymentId: activePayment.id, adId,
        amount: -activePayment.amount, type: 'debit',
        description: `Refund for rejected ad from category: ${categoryId}`
      });
    }

    await Payment.update(activePayment.id, {
      status: 'refunded', refundedAt: now, refundReason: 'Ad rejected by web owner'
    });

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Ad rejected and refund processed' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ad rejection error:', error);
    res.status(400).json({ error: error.message || 'Failed to reject ad' });
  } finally {
    client.release();
  }
};

// Get ads pending rejection (for web owner dashboard)
exports.getPendingRejections = async (req, res) => {
  try {
    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const now = new Date();

    const categories = await AdCategory.findByOwner(webOwnerId);
    const categoryIds = categories.map(cat => cat.id);

    // Use the PG-native method — no .find(), no .populate()
    const pendingAds = await ImportAd.findPendingByCategories(categoryIds, now);

    res.status(200).json({ success: true, pendingAds });
  } catch (error) {
    console.error('Error fetching pending rejections:', error);
    res.status(500).json({ error: 'Failed to fetch pending rejections' });
  }
};