// controllers/WithdrawalController.js
const { Wallet, WalletTransaction } = require('../models/walletModel');
const WithdrawalRequest = require('../models/WithdrawalModel');
const mongoose = require('mongoose');

// Create withdrawal request (User endpoint)
exports.createWithdrawalRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const userEmail = req.user.email;
    const { ownerType } = req.params;
    const { 
      amount, 
      bankName, 
      accountNumber, 
      accountName, 
      country,
      routingNumber,
      swiftCode 
    } = req.body;

    console.log('Request params:', { ownerType, userId, userEmail });
    console.log('Request body:', req.body);

    // Validation
    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    if (!bankName || !accountNumber || !accountName || !country) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'All required bank details must be provided' });
    }

    // Convert userId to string to ensure consistency
    const userIdStr = String(userId);

    // Find wallet
    const wallet = await Wallet.findOne({
      ownerId: userIdStr,
      ownerType: ownerType
    }).session(session);

    console.log('Wallet found:', wallet);

    if (!wallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Check if wallet has sufficient balance
    if (wallet.balance < amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        error: 'Insufficient balance',
        currentBalance: wallet.balance,
        requestedAmount: amount
      });
    }

    // Check for pending withdrawal requests
    const pendingRequest = await WithdrawalRequest.findOne({
      userId: userIdStr,
      ownerType: ownerType,
      status: 'pending'
    }).session(session);

    if (pendingRequest) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        error: 'You already have a pending withdrawal request. Please wait for it to be processed.' 
      });
    }

    // Create withdrawal request
    const withdrawalRequest = new WithdrawalRequest({
      walletId: wallet._id,
      userId: userIdStr,
      userEmail: userEmail,
      ownerType: ownerType,
      amount: parseFloat(amount),
      bankDetails: {
        bankName,
        accountNumber,
        accountName,
        country,
        routingNumber: routingNumber || '',
        swiftCode: swiftCode || ''
      },
      walletBalanceAtRequest: wallet.balance,
      status: 'pending'
    });

    await withdrawalRequest.save({ session });
    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      withdrawalRequest: {
        id: withdrawalRequest._id,
        amount: withdrawalRequest.amount,
        status: withdrawalRequest.status,
        createdAt: withdrawalRequest.createdAt
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Withdrawal request error:', error);
    res.status(500).json({ error: 'Failed to create withdrawal request', details: error.message });
  } finally {
    session.endSession();
  }
};

// Get user's withdrawal requests
exports.getUserWithdrawalRequests = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { ownerType } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const withdrawalRequests = await WithdrawalRequest.find({
      userId: userId,
      ownerType: ownerType
    })
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await WithdrawalRequest.countDocuments({
      userId: userId,
      ownerType: ownerType
    });

    res.status(200).json({
      success: true,
      withdrawalRequests,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    console.error('Get withdrawal requests error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
};

// Cancel withdrawal request (User can only cancel pending requests)
exports.cancelWithdrawalRequest = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { requestId } = req.params;

    const withdrawalRequest = await WithdrawalRequest.findOne({
      _id: requestId,
      userId: userId
    });

    if (!withdrawalRequest) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (withdrawalRequest.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Only pending withdrawal requests can be cancelled' 
      });
    }

    withdrawalRequest.status = 'cancelled';
    await withdrawalRequest.save();

    res.status(200).json({
      success: true,
      message: 'Withdrawal request cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel withdrawal error:', error);
    res.status(500).json({ error: 'Failed to cancel withdrawal request' });
  }
};

// ADMIN ENDPOINTS

// Get all withdrawal requests (Admin only)
exports.getAllWithdrawalRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, ownerType } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (ownerType) filter.ownerType = ownerType;

    const withdrawalRequests = await WithdrawalRequest.find(filter)
    .populate('walletId')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await WithdrawalRequest.countDocuments(filter);

    res.status(200).json({
      success: true,
      withdrawalRequests,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    console.error('Get all withdrawal requests error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
};

// Process withdrawal request (Admin only)
exports.processWithdrawalRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminId = req.user.userId || req.user.id || req.user._id;
    const { requestId } = req.params;
    const { action, adminNotes, rejectionReason } = req.body;

    if (!['approve', 'reject', 'complete'].includes(action)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Invalid action' });
    }

    const withdrawalRequest = await WithdrawalRequest.findById(requestId)
      .populate('walletId')
      .session(session);

    if (!withdrawalRequest) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (withdrawalRequest.status !== 'pending' && action === 'approve') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }

    if (withdrawalRequest.status !== 'approved' && action === 'complete') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Only approved requests can be completed' });
    }

    const wallet = await Wallet.findById(withdrawalRequest.walletId).session(session);

    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (action === 'reject') {
      withdrawalRequest.status = 'rejected';
      withdrawalRequest.rejectionReason = rejectionReason || 'Not specified';
      withdrawalRequest.processedBy = adminId;
      withdrawalRequest.processedAt = new Date();
      if (adminNotes) withdrawalRequest.adminNotes = adminNotes;
      await withdrawalRequest.save({ session });

    } else if (action === 'approve') {
      // Check if wallet still has sufficient balance
      if (wallet.balance < withdrawalRequest.amount) {
        await session.abortTransaction();
        return res.status(400).json({ 
          error: 'Insufficient wallet balance',
          currentBalance: wallet.balance,
          requestedAmount: withdrawalRequest.amount
        });
      }

      withdrawalRequest.status = 'approved';
      withdrawalRequest.processedBy = adminId;
      withdrawalRequest.processedAt = new Date();
      if (adminNotes) withdrawalRequest.adminNotes = adminNotes;
      await withdrawalRequest.save({ session });

    } else if (action === 'complete') {
      // Deduct amount from wallet and create transaction
      wallet.balance -= withdrawalRequest.amount;
      wallet.totalSpent += withdrawalRequest.amount;
      wallet.lastUpdated = new Date();
      await wallet.save({ session });

      // Create wallet transaction
      const transaction = new WalletTransaction({
        walletId: wallet._id,
        paymentId: withdrawalRequest._id, // Using withdrawal request as payment reference
        adId: withdrawalRequest._id, // Placeholder, adjust as needed
        amount: -withdrawalRequest.amount,
        type: 'debit',
        description: `Withdrawal to ${withdrawalRequest.bankDetails.bankName} - ${withdrawalRequest.bankDetails.accountNumber}`,
        status: 'completed'
      });
      await transaction.save({ session });

      withdrawalRequest.status = 'completed';
      withdrawalRequest.transactionId = transaction._id;
      if (adminNotes) withdrawalRequest.adminNotes = adminNotes;
      await withdrawalRequest.save({ session });
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Withdrawal request ${action}d successfully`,
      withdrawalRequest
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Process withdrawal error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal request' });
  } finally {
    session.endSession();
  }
};

module.exports = exports;