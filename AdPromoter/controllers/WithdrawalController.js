// controllers/WithdrawalController.js
const mongoose = require('mongoose');
const { Wallet, WalletTransaction } = require('../models/walletModel');
const { User } = require('../../models/User');
const axios = require('axios');

// Withdrawal Model
const withdrawalSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true,
    index: true
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  amount: { 
    type: Number, 
    required: true,
    min: 1
  },
  method: {
    type: String,
    enum: ['bank_transfer', 'mobile_money', 'paypal', 'crypto'],
    required: true
  },
  accountDetails: {
    // Bank Transfer
    bankName: String,
    accountNumber: String,
    accountName: String,
    routingNumber: String,
    swiftCode: String,
    
    // Mobile Money
    phoneNumber: String,
    provider: String, // MTN, Airtel, etc.
    
    // PayPal
    paypalEmail: String,
    
    // Crypto
    walletAddress: String,
    cryptoType: String // BTC, ETH, USDT, etc.
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: Date,
  completedAt: Date,
  failureReason: String,
  processingFee: {
    type: Number,
    default: 0
  },
  netAmount: Number, // Amount after fees
  transactionId: String, // External transaction ID
  adminNotes: String,
  
  // Flutterwave Transfer Data
  flutterwaveData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

withdrawalSchema.index({ userId: 1, status: 1 });
withdrawalSchema.index({ createdAt: -1 });
withdrawalSchema.index({ status: 1 });

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

class WithdrawalController {
  
  // Get wallet balance and withdrawal history
  getWalletInfo = async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id || req.user._id;
      
      // Get wallet info
      const wallet = await Wallet.findOne({ 
        ownerId: userId, 
        ownerType: 'webOwner' 
      });

      if (!wallet) {
        return res.status(404).json({ 
          error: 'Wallet not found',
          message: 'No wallet found for this user'
        });
      }

      // Get withdrawal history
      const withdrawals = await Withdrawal.find({ userId })
        .sort({ createdAt: -1 })
        .limit(20);

      // Calculate pending withdrawals
      const pendingWithdrawals = await Withdrawal.aggregate([
        {
          $match: {
            userId: userId,
            status: { $in: ['pending', 'processing'] }
          }
        },
        {
          $group: {
            _id: null,
            totalPending: { $sum: '$amount' }
          }
        }
      ]);

      const pendingAmount = pendingWithdrawals.length > 0 ? pendingWithdrawals[0].totalPending : 0;
      const availableForWithdrawal = Math.max(0, wallet.balance - pendingAmount);

      // Get recent transactions
      const recentTransactions = await WalletTransaction.find({ walletId: wallet._id })
        // .populate('paymentId', 'adId amount')
        // .populate('adId', 'businessName')
        .sort({ createdAt: -1 })
        .limit(10);

      res.status(200).json({
        success: true,
        wallet: {
          balance: wallet.balance,
          totalEarned: wallet.totalEarned,
          availableForWithdrawal,
          pendingWithdrawals: pendingAmount
        },
        withdrawals,
        recentTransactions
      });

    } catch (error) {
      console.error('Get wallet info error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch wallet information',
        message: error.message 
      });
    }
  }

  // Request withdrawal
  requestWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { amount, method, accountDetails } = req.body;

    // Validation
    if (!amount || amount < 1) {
      return res.status(400).json({ 
        error: 'Invalid amount',
        message: 'Withdrawal amount must be at least $1'
      });
    }

    if (!method || !['bank_transfer', 'mobile_money', 'paypal', 'crypto'].includes(method)) {
      return res.status(400).json({ 
        error: 'Invalid withdrawal method',
        message: 'Please select a valid withdrawal method'
      });
    }

    // Validate account details based on method
    const validation = this.validateAccountDetails(method, accountDetails);
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Invalid account details',
        message: validation.message 
      });
    }

    await session.withTransaction(async () => {
      // Get wallet
      const wallet = await Wallet.findOne({ 
        ownerId: userId, 
        ownerType: 'webOwner' 
      }).session(session);

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Check pending withdrawals
      const pendingWithdrawals = await Withdrawal.aggregate([
        {
          $match: {
            userId: userId,
            status: { $in: ['pending', 'processing'] }
          }
        },
        {
          $group: {
            _id: null,
            totalPending: { $sum: '$amount' }
          }
        }
      ]).session(session);

      const pendingAmount = pendingWithdrawals.length > 0 ? pendingWithdrawals[0].totalPending : 0;
      const availableBalance = wallet.balance - pendingAmount;

      if (availableBalance < amount) {
        throw new Error(`Insufficient available balance. Available: $${availableBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`);
      }

      // Calculate processing fee (2% or minimum $1)
      const processingFee = Math.max(1, amount * 0.02);
      const netAmount = amount - processingFee;

      // Create withdrawal request
      const withdrawal = new Withdrawal({
        userId,
        walletId: wallet._id,
        amount,
        method,
        accountDetails,
        processingFee,
        netAmount,
        status: 'pending'
      });

      await withdrawal.save({ session });

      const walletTransaction = new WalletTransaction({
        walletId: wallet._id,
        relatedTransactionId: withdrawal._id,
        amount: -amount, // Negative for debit
        type: 'debit',
        description: `Withdrawal request - ${method}`,
        status: 'pending'
      });

      await walletTransaction.save({ session });

      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        withdrawal: {
          id: withdrawal._id,
          amount,
          processingFee,
          netAmount,
          method,
          status: 'pending',
          requestedAt: withdrawal.requestedAt
        }
      });
    });

  } catch (error) {
    console.error('Request withdrawal error:', error);
    res.status(500).json({ 
      error: 'Withdrawal request failed',
      message: error.message 
    });
  } finally {
    await session.endSession();
  }
}

  // Cancel withdrawal (only for pending requests)
  cancelWithdrawal = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
      const userId = req.user.userId || req.user.id || req.user._id;
      const { withdrawalId } = req.params;

      await session.withTransaction(async () => {
        const withdrawal = await Withdrawal.findOne({
          _id: withdrawalId,
          userId: userId
        }).session(session);

        if (!withdrawal) {
          throw new Error('Withdrawal request not found');
        }

        if (withdrawal.status !== 'pending') {
          throw new Error(`Cannot cancel withdrawal with status: ${withdrawal.status}`);
        }

        // Update withdrawal status
        withdrawal.status = 'cancelled';
        withdrawal.failureReason = 'Cancelled by user';
        await withdrawal.save({ session });

        // Update related wallet transaction
        await WalletTransaction.findOneAndUpdate(
          { relatedTransactionId: withdrawal._id },
          { status: 'failed', description: 'Withdrawal cancelled by user' },
          { session }
        );

        res.status(200).json({
          success: true,
          message: 'Withdrawal request cancelled successfully'
        });
      });

    } catch (error) {
      console.error('Cancel withdrawal error:', error);
      res.status(500).json({ 
        error: 'Failed to cancel withdrawal',
        message: error.message 
      });
    } finally {
      await session.endSession();
    }
  }

  // Process withdrawal (Admin function)
  processWithdrawal = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
      const { withdrawalId } = req.params;
      const { action, adminNotes } = req.body; // action: 'approve' or 'reject'

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ 
          error: 'Invalid action',
          message: 'Action must be approve or reject' 
        });
      }

      await session.withTransaction(async () => {
        const withdrawal = await Withdrawal.findById(withdrawalId)
          .populate('walletId')
          .session(session);

        if (!withdrawal) {
          throw new Error('Withdrawal request not found');
        }

        if (withdrawal.status !== 'pending') {
          throw new Error(`Cannot process withdrawal with status: ${withdrawal.status}`);
        }

        if (action === 'approve') {
          // Process the withdrawal via Flutterwave or other payment provider
          const transferResult = await this.processTransfer(withdrawal);
          
          if (transferResult.success) {
            // Update withdrawal
            withdrawal.status = 'processing';
            withdrawal.processedAt = new Date();
            withdrawal.transactionId = transferResult.transactionId;
            withdrawal.flutterwaveData = transferResult.data;
            withdrawal.adminNotes = adminNotes;

            // Deduct from wallet balance
            await Wallet.findByIdAndUpdate(
              withdrawal.walletId._id,
              { 
                $inc: { balance: -withdrawal.amount },
                $set: { lastUpdated: new Date() }
              },
              { session }
            );

            // Update wallet transaction
            await WalletTransaction.findOneAndUpdate(
              { relatedTransactionId: withdrawal._id },
              { 
                status: 'completed',
                description: `Withdrawal processed - ${withdrawal.method}`
              },
              { session }
            );

          } else {
            withdrawal.status = 'failed';
            withdrawal.failureReason = transferResult.error;
            withdrawal.adminNotes = adminNotes;

            // Update wallet transaction as failed
            await WalletTransaction.findOneAndUpdate(
              { relatedTransactionId: withdrawal._id },
              { 
                status: 'failed',
                description: `Withdrawal failed - ${transferResult.error}`
              },
              { session }
            );
          }
        } else {
          // Reject withdrawal
          withdrawal.status = 'failed';
          withdrawal.failureReason = 'Rejected by admin';
          withdrawal.adminNotes = adminNotes;
          withdrawal.processedAt = new Date();

          // Update wallet transaction as failed
          await WalletTransaction.findOneAndUpdate(
            { relatedTransactionId: withdrawal._id },
            { 
              status: 'failed',
              description: 'Withdrawal rejected by admin'
            },
            { session }
          );
        }

        await withdrawal.save({ session });

        res.status(200).json({
          success: true,
          message: `Withdrawal ${action}d successfully`,
          withdrawal
        });
      });

    } catch (error) {
      console.error('Process withdrawal error:', error);
      res.status(500).json({ 
        error: 'Failed to process withdrawal',
        message: error.message 
      });
    } finally {
      await session.endSession();
    }
  }

  // Get withdrawal methods and their requirements
  getWithdrawalMethods = async (req, res) => {
    try {
      const methods = {
        bank_transfer: {
          name: 'Bank Transfer',
          fee: '2% (minimum $1)',
          processingTime: '1-3 business days',
          requiredFields: [
            { field: 'bankName', label: 'Bank Name', type: 'text', required: true },
            { field: 'accountNumber', label: 'Account Number', type: 'text', required: true },
            { field: 'accountName', label: 'Account Name', type: 'text', required: true },
            { field: 'routingNumber', label: 'Routing Number', type: 'text', required: false },
            { field: 'swiftCode', label: 'SWIFT Code', type: 'text', required: false }
          ]
        },
        mobile_money: {
          name: 'Mobile Money',
          fee: '2% (minimum $1)',
          processingTime: '10-30 minutes',
          requiredFields: [
            { field: 'provider', label: 'Provider', type: 'select', options: ['MTN', 'Airtel', 'Tigo', 'Other'], required: true },
            { field: 'phoneNumber', label: 'Phone Number', type: 'tel', required: true }
          ]
        },
        paypal: {
          name: 'PayPal',
          fee: '2% (minimum $1)',
          processingTime: '1-2 hours',
          requiredFields: [
            { field: 'paypalEmail', label: 'PayPal Email', type: 'email', required: true }
          ]
        },
        crypto: {
          name: 'Cryptocurrency',
          fee: '2% (minimum $1)',
          processingTime: '30 minutes - 2 hours',
          requiredFields: [
            { field: 'cryptoType', label: 'Crypto Type', type: 'select', options: ['BTC', 'ETH', 'USDT', 'USDC'], required: true },
            { field: 'walletAddress', label: 'Wallet Address', type: 'text', required: true }
          ]
        }
      };

      res.status(200).json({
        success: true,
        methods
      });

    } catch (error) {
      console.error('Get withdrawal methods error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch withdrawal methods',
        message: error.message 
      });
    }
  }

  // Validate account details based on withdrawal method
  validateAccountDetails = (method, accountDetails) => {
    if (!accountDetails) {
      return { isValid: false, message: 'Account details are required' };
    }

    switch (method) {
      case 'bank_transfer':
        if (!accountDetails.bankName || !accountDetails.accountNumber || !accountDetails.accountName) {
          return { isValid: false, message: 'Bank name, account number, and account name are required' };
        }
        break;
      
      case 'mobile_money':
        if (!accountDetails.provider || !accountDetails.phoneNumber) {
          return { isValid: false, message: 'Provider and phone number are required' };
        }
        // Validate phone number format
        const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(accountDetails.phoneNumber)) {
          return { isValid: false, message: 'Invalid phone number format' };
        }
        break;
      
      case 'paypal':
        if (!accountDetails.paypalEmail) {
          return { isValid: false, message: 'PayPal email is required' };
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(accountDetails.paypalEmail)) {
          return { isValid: false, message: 'Invalid PayPal email format' };
        }
        break;
      
      case 'crypto':
        if (!accountDetails.cryptoType || !accountDetails.walletAddress) {
          return { isValid: false, message: 'Crypto type and wallet address are required' };
        }
        // Basic validation for wallet address length
        if (accountDetails.walletAddress.length < 20) {
          return { isValid: false, message: 'Invalid wallet address' };
        }
        break;
      
      default:
        return { isValid: false, message: 'Invalid withdrawal method' };
    }

    return { isValid: true };
  }

  // Process transfer via payment provider (Flutterwave example)
  processTransfer = async (withdrawal) => {
    try {
      const secretKey = process.env.FLW_TEST_SECRET_KEY;
      
      if (!secretKey) {
        return { success: false, error: 'Payment provider not configured' };
      }

      let transferData;

      switch (withdrawal.method) {
        case 'bank_transfer':
          transferData = {
            account_bank: withdrawal.accountDetails.bankName,
            account_number: withdrawal.accountDetails.accountNumber,
            amount: withdrawal.netAmount,
            currency: "USD",
            reference: `withdrawal_${withdrawal._id}_${Date.now()}`,
            beneficiary_name: withdrawal.accountDetails.accountName,
            meta: [
              {
                first_name: withdrawal.accountDetails.accountName.split(' ')[0] || '',
                last_name: withdrawal.accountDetails.accountName.split(' ').slice(1).join(' ') || '',
                email: "user@example.com"
              }
            ]
          };
          break;

        case 'mobile_money':
          transferData = {
            account_bank: withdrawal.accountDetails.provider,
            account_number: withdrawal.accountDetails.phoneNumber,
            amount: withdrawal.netAmount,
            currency: "USD",
            reference: `withdrawal_${withdrawal._id}_${Date.now()}`,
            meta: [
              {
                mobile_number: withdrawal.accountDetails.phoneNumber,
                email: "user@example.com"
              }
            ]
          };
          break;

        default:
          return { success: false, error: `Transfer method ${withdrawal.method} not implemented yet` };
      }

      const response = await axios.post(
        'https://api.flutterwave.com/v3/transfers',
        transferData,
        {
          headers: {
            'Authorization': `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.status === 'success') {
        return {
          success: true,
          transactionId: response.data.data.id,
          data: response.data.data
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'Transfer failed'
        };
      }

    } catch (error) {
      console.error('Transfer processing error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Webhook to handle transfer status updates
  handleTransferWebhook = async (req, res) => {
    try {
      const secretHash = process.env.FLW_SECRET_HASH;
      const signature = req.headers["verif-hash"];

      if (!signature || signature !== secretHash) {
        return res.status(401).json({ error: 'Unauthorized webhook' });
      }

      const payload = req.body;

      if (payload.event === 'transfer.completed') {
        const reference = payload.data.reference;
        const withdrawalId = reference.split('_')[1]; // Extract withdrawal ID from reference

        await Withdrawal.findByIdAndUpdate(
          withdrawalId,
          {
            status: 'completed',
            completedAt: new Date(),
            flutterwaveData: payload.data
          }
        );

        // Update wallet transaction
        await WalletTransaction.findOneAndUpdate(
          { relatedTransactionId: withdrawalId },
          { 
            status: 'completed',
            description: 'Withdrawal completed successfully'
          }
        );

      } else if (payload.event === 'transfer.failed') {
        const reference = payload.data.reference;
        const withdrawalId = reference.split('_')[1];

        await Withdrawal.findByIdAndUpdate(
          withdrawalId,
          {
            status: 'failed',
            failureReason: payload.data.complete_message || 'Transfer failed',
            flutterwaveData: payload.data
          }
        );

        // Update wallet transaction
        await WalletTransaction.findOneAndUpdate(
          { relatedTransactionId: withdrawalId },
          { 
            status: 'failed',
            description: `Withdrawal failed: ${payload.data.complete_message || 'Transfer failed'}`
          }
        );

        // Refund the amount back to wallet
        const withdrawal = await Withdrawal.findById(withdrawalId).populate('walletId');
        if (withdrawal) {
          await Wallet.findByIdAndUpdate(
            withdrawal.walletId._id,
            { 
              $inc: { balance: withdrawal.amount },
              $set: { lastUpdated: new Date() }
            }
          );
        }
      }

      res.status(200).json({ status: 'success' });

    } catch (error) {
      console.error('Transfer webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  // Get all withdrawals (Admin)
  getAllWithdrawals = async (req, res) => {
    try {
      const { page = 1, limit = 20, status, method } = req.query;
      
      const query = {};
      if (status) query.status = status;
      if (method) query.method = method;

      const withdrawals = await Withdrawal.find(query)
        .populate('walletId', 'ownerEmail')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

      const total = await Withdrawal.countDocuments(query);

      res.status(200).json({
        success: true,
        withdrawals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get all withdrawals error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch withdrawals',
        message: error.message 
      });
    }
  }
}

module.exports = { WithdrawalController: new WithdrawalController(), Withdrawal };