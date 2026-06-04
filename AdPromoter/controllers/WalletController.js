// controllers/WalletController.js  (PostgreSQL)
const { Wallet, WalletTransaction } = require('../models/walletModel');
const User = require('../../models/User');

exports.getWallet = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;

    // Try to find the wallet — check both ownerTypes
    let wallet = await Wallet.findByOwner(userId, 'webOwner')
               || await Wallet.findByOwner(userId, 'advertiser');

    if (!wallet) {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const ownerType = user.role === 'advertiser' ? 'advertiser' : 'webOwner';
      wallet = await Wallet.create({ ownerId: userId, ownerEmail: user.email, ownerType });
    }

    res.status(200).json({ success: true, wallet });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ error: 'Error fetching wallet', message: error.message });
  }
};

exports.getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { page = 1, limit = 20 } = req.query;

    // Find wallet (either ownerType)
    const wallet = await Wallet.findByOwner(userId, 'webOwner')
                || await Wallet.findByOwner(userId, 'advertiser');

    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const transactions = await WalletTransaction.findByWalletPaginated(wallet.id, parseInt(page), parseInt(limit));
    const total = await WalletTransaction.countByWallet(wallet.id);

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching transactions', message: error.message });
  }
};

exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { ownerType } = req.params;

    const wallet = await Wallet.findByOwner(userId, ownerType);

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found',
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        totalRefunded: 0,
      });
    }

    res.status(200).json({
      success: true,
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.total_earned,
        totalSpent: wallet.total_spent,
        totalRefunded: wallet.total_refunded,
        lastUpdated: wallet.last_updated,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
};

exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { ownerType } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const wallet = await Wallet.findByOwner(userId, ownerType);

    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const transactions = await WalletTransaction.findByWalletPaginated(wallet.id, parseInt(page), parseInt(limit));
    const total = await WalletTransaction.countByWallet(wallet.id);

    res.status(200).json({
      success: true,
      transactions,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
};
