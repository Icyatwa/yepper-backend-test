// controllers/WalletController.js
const { Wallet, WalletTransaction } = require('../models/WalletModel');

exports.getWallet = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    let wallet = await Wallet.findOne({ ownerId: userId });
    
    if (!wallet) {
      const user = await User.findById(userId);
      wallet = new Wallet({
        ownerId: userId,
        ownerEmail: user.email,
        balance: 0,
        totalEarned: 0
      });
      await wallet.save();
    }

    res.status(200).json({ success: true, wallet });

  } catch (error) {
    res.status(500).json({ error: 'Error fetching wallet', message: error.message });
  }
};

exports.getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const wallet = await Wallet.findOne({ ownerId: userId });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const transactions = await WalletTransaction.find({ walletId: wallet._id })
      .populate('paymentId')
      .populate('adId', 'businessName adDescription')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await WalletTransaction.countDocuments({ walletId: wallet._id });

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error fetching transactions', message: error.message });
  }
};