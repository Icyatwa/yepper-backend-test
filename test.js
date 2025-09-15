// models/WalletModel.js
const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  ownerId: { 
    type: String, 
    required: true
  },
  ownerEmail: { 
    type: String, 
    required: true 
  },
  ownerType: {
    type: String,
    enum: ['webOwner', 'advertiser'],
    required: true
  },
  balance: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  totalEarned: { 
    type: Number, 
    default: 0 
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  totalRefunded: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound unique index instead of single field unique
walletSchema.index({ ownerId: 1, ownerType: 1 }, { unique: true });

const transactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true
  },
  adId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ImportAd',
    required: true
  },
  relatedTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WalletTransaction',
    default: null // For linking refund transactions to original transactions
  },
  amount: { 
    type: Number, 
    required: true 
  },
  type: {
    type: String,
    enum: ['credit', 'debit', 'refund_credit', 'refund_debit'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  },
  transactionHash: {
    type: String,
    unique: true,
    sparse: true
  },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

const Wallet = mongoose.model('Wallet', walletSchema);
const WalletTransaction = mongoose.model('WalletTransaction', transactionSchema);

module.exports = { Wallet, WalletTransaction };

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
  async getWalletInfo(req, res) {
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
        .populate('paymentId', 'adId amount')
        .populate('adId', 'businessName')
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
  async requestWithdrawal(req, res) {
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

      // Validate account details based on method - FIXED: Store reference to this
      const controller = this;
      const validation = controller.validateAccountDetails(method, accountDetails);
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

        // Create wallet transaction for the withdrawal request
        const walletTransaction = new WalletTransaction({
          walletId: wallet._id,
          paymentId: null,
          adId: null,
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
  async cancelWithdrawal(req, res) {
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
  async processWithdrawal(req, res) {
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

      const controller = this; // Store reference to this

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
          const transferResult = await controller.processTransfer(withdrawal);
          
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
  async getWithdrawalMethods(req, res) {
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
  validateAccountDetails(method, accountDetails) {
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
  async processTransfer(withdrawal) {
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
  async handleTransferWebhook(req, res) {
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
  async getAllWithdrawals(req, res) {
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

// WithdrawalDashboard.js
import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  CreditCard, 
  Smartphone, 
  Building2, 
  Bitcoin,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  DollarSign,
  TrendingUp,
  Calendar
} from 'lucide-react';

const WithdrawalDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [walletInfo, setWalletInfo] = useState(null);
  const [withdrawalMethods, setWithdrawalMethods] = useState({});
  const [showWithdrawalForm, setShowWithdrawalForm] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [accountDetails, setAccountDetails] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showBalance, setShowBalance] = useState(true);

  useEffect(() => {
    fetchWalletInfo();
    fetchWithdrawalMethods();
  }, []);

  const fetchWalletInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/withdrawals/wallet-info', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success) {
        setWalletInfo(data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to fetch wallet information');
    }
  };

  const fetchWithdrawalMethods = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/withdrawals/methods', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success) {
        setWithdrawalMethods(data.methods);
      }
    } catch (err) {
      console.error('Failed to fetch withdrawal methods');
    }
  };

  const handleWithdrawalSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/withdrawals/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(withdrawalAmount),
          method: selectedMethod,
          accountDetails
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Withdrawal request submitted successfully!');
        setShowWithdrawalForm(false);
        setWithdrawalAmount('');
        setAccountDetails({});
        setSelectedMethod('');
        fetchWalletInfo(); // Refresh wallet info
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to submit withdrawal request');
    } finally {
      setLoading(false);
    }
  };

  const cancelWithdrawal = async (withdrawalId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/withdrawals/${withdrawalId}/cancel`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Withdrawal cancelled successfully');
        fetchWalletInfo();
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to cancel withdrawal');
    }
  };

  const renderAccountDetailsForm = () => {
    if (!selectedMethod || !withdrawalMethods[selectedMethod]) return null;

    const method = withdrawalMethods[selectedMethod];
    
    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900">Account Details</h4>
        {method.requiredFields.map((field) => (
          <div key={field.field}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.type === 'select' ? (
              <select
                value={accountDetails[field.field] || ''}
                onChange={(e) => setAccountDetails(prev => ({
                  ...prev,
                  [field.field]: e.target.value
                }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required={field.required}
              >
                <option value="">Select {field.label}</option>
                {field.options?.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={accountDetails[field.field] || ''}
                onChange={(e) => setAccountDetails(prev => ({
                  ...prev,
                  [field.field]: e.target.value
                }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={`Enter ${field.label.toLowerCase()}`}
                required={field.required}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing':
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMethodIcon = (method) => {
    switch (method) {
      case 'bank_transfer':
        return <Building2 className="w-5 h-5" />;
      case 'mobile_money':
        return <Smartphone className="w-5 h-5" />;
      case 'paypal':
        return <CreditCard className="w-5 h-5" />;
      case 'crypto':
        return <Bitcoin className="w-5 h-5" />;
      default:
        return <Wallet className="w-5 h-5" />;
    }
  };

  if (!walletInfo) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Wallet & Withdrawals</h1>
        <p className="text-gray-600">Manage your earnings and withdraw funds</p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
          <XCircle className="w-5 h-5 text-red-500 mr-3" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
          <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
          <span className="text-green-700">{success}</span>
        </div>
      )}

      {/* Wallet Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Wallet className="w-8 h-8 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900 ml-3">Total Balance</h3>
            </div>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-gray-500 hover:text-gray-700"
            >
              {showBalance ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {showBalance ? `${walletInfo.wallet.balance.toFixed(2)}` : '••••'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center mb-4">
            <Download className="w-8 h-8 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900 ml-3">Available</h3>
          </div>
          <p className="text-3xl font-bold text-green-600">
            ${walletInfo.wallet.availableForWithdrawal.toFixed(2)}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center mb-4">
            <Clock className="w-8 h-8 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900 ml-3">Pending</h3>
          </div>
          <p className="text-3xl font-bold text-yellow-600">
            ${walletInfo.wallet.pendingWithdrawals.toFixed(2)}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center mb-4">
            <TrendingUp className="w-8 h-8 text-purple-500" />
            <h3 className="text-lg font-semibold text-gray-900 ml-3">Total Earned</h3>
          </div>
          <p className="text-3xl font-bold text-purple-600">
            ${walletInfo.wallet.totalEarned.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: Wallet },
            { id: 'withdraw', label: 'Withdraw', icon: Download },
            { id: 'history', label: 'History', icon: Calendar }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-5 h-5 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Recent Transactions */}
          <div className="bg-white rounded-xl shadow-md">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Recent Transactions</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {walletInfo.recentTransactions && walletInfo.recentTransactions.length > 0 ? (
                walletInfo.recentTransactions.map((transaction, index) => (
                  <div key={index} className="p-6 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`p-2 rounded-full ${
                        transaction.type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        <DollarSign className={`w-4 h-4 ${
                          transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                        }`} />
                      </div>
                      <div className="ml-4">
                        <p className="font-medium text-gray-900">{transaction.description}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(transaction.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className={`font-semibold ${
                      transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.type === 'credit' ? '+' : '-'}${Math.abs(transaction.amount).toFixed(2)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-gray-500">
                  No recent transactions
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="space-y-6">
          {!showWithdrawalForm ? (
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">Withdraw Funds</h3>
                <p className="text-gray-600">Available for withdrawal: <span className="font-semibold text-green-600">${walletInfo.wallet.availableForWithdrawal.toFixed(2)}</span></p>
              </div>

              {walletInfo.wallet.availableForWithdrawal > 0 ? (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {Object.entries(withdrawalMethods).map(([method, details]) => (
                      <button
                        key={method}
                        onClick={() => {
                          setSelectedMethod(method);
                          setShowWithdrawalForm(true);
                        }}
                        className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 group"
                      >
                        <div className="flex flex-col items-center text-center">
                          <div className="p-3 bg-gray-100 rounded-full group-hover:bg-blue-100 mb-4">
                            {getMethodIcon(method)}
                          </div>
                          <h4 className="font-semibold text-gray-900 mb-2">{details.name}</h4>
                          <p className="text-sm text-gray-500 mb-2">Fee: {details.fee}</p>
                          <p className="text-xs text-gray-400">{details.processingTime}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <p>No funds available for withdrawal</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  Withdraw via {withdrawalMethods[selectedMethod]?.name}
                </h3>
                <button
                  onClick={() => {
                    setShowWithdrawalForm(false);
                    setSelectedMethod('');
                    setWithdrawalAmount('');
                    setAccountDetails({});
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleWithdrawalSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Withdrawal Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      max={walletInfo.wallet.availableForWithdrawal}
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Fee: {withdrawalMethods[selectedMethod]?.fee} | 
                    Processing Time: {withdrawalMethods[selectedMethod]?.processingTime}
                  </p>
                </div>

                {renderAccountDetailsForm()}

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowWithdrawalForm(false);
                      setSelectedMethod('');
                      setWithdrawalAmount('');
                      setAccountDetails({});
                    }}
                    className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-md">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900">Withdrawal History</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {walletInfo.withdrawals && walletInfo.withdrawals.length > 0 ? (
              walletInfo.withdrawals.map((withdrawal) => (
                <div key={withdrawal._id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="p-2 bg-gray-100 rounded-full mr-4">
                        {getMethodIcon(withdrawal.method)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          ${withdrawal.amount.toFixed(2)} via {withdrawalMethods[withdrawal.method]?.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          Requested on {new Date(withdrawal.requestedAt).toLocaleDateString()}
                        </p>
                        {withdrawal.failureReason && (
                          <p className="text-sm text-red-600">
                            Reason: {withdrawal.failureReason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(withdrawal.status)}`}>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(withdrawal.status)}
                          {withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                        </div>
                      </span>
                      {withdrawal.status === 'pending' && (
                        <button
                          onClick={() => cancelWithdrawal(withdrawal._id)}
                          className="text-sm text-red-600 hover:text-red-800 font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-gray-500">
                No withdrawal history
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalDashboard;

the data i inserted for testing it, cause it's a test mode: Withdrawal Amount(5), Bank Name(Chase Bank), Account Number(1234567890), Account Name(Test User), Routing Number(021000021)