// WithdrawalController.js — PostgreSQL version
const { query, getClient } = require('../../config/db');
const { Wallet, WalletTransaction } = require('../models/walletModel');
const WithdrawalRequest = require('../models/WithdrawalModel');

exports.createWithdrawalRequest = async (req, res) => {
  const client = await getClient();
  try {
    const userId = String(req.user.userId || req.user.id || req.user._id);
    const userEmail = req.user.email;
    const { ownerType } = req.params;
    const { amount, bankName, accountNumber, accountName, country, routingNumber, swiftCode } = req.body;

    if (!amount || amount <= 0)
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    if (!bankName || !accountNumber || !accountName || !country)
      return res.status(400).json({ error: 'All required bank details must be provided' });

    await client.query('BEGIN');

    const wallet = await Wallet.findByOwner(userId, ownerType);
    if (!wallet) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Wallet not found' }); }
    if (wallet.balance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient balance', currentBalance: wallet.balance, requestedAmount: amount });
    }

    // Check for existing pending request
    const { rows: existing } = await client.query(
      `SELECT id FROM withdrawal_requests WHERE user_id=$1 AND owner_type=$2 AND status='pending'`,
      [userId, ownerType]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You already have a pending withdrawal request.' });
    }

    const withdrawalRequest = await WithdrawalRequest.create({
      walletId: wallet.id,
      userId,
      userEmail,
      ownerType,
      amount: parseFloat(amount),
      bankDetails: { bankName, accountNumber, accountName, country, routingNumber: routingNumber || '', swiftCode: swiftCode || '' },
      walletBalanceAtRequest: wallet.balance,
    });

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      withdrawalRequest: { id: withdrawalRequest.id, amount: withdrawalRequest.amount, status: withdrawalRequest.status, createdAt: withdrawalRequest.created_at }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Withdrawal request error:', error);
    res.status(500).json({ error: 'Failed to create withdrawal request', details: error.message });
  } finally {
    client.release();
  }
};

exports.getUserWithdrawalRequests = async (req, res) => {
  try {
    const userId = String(req.user.userId || req.user.id || req.user._id);
    const { ownerType } = req.params;
    const page  = parseInt(req.query.page  || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);

    const { rows: all } = await query(
      `SELECT * FROM withdrawal_requests WHERE user_id=$1 AND owner_type=$2 ORDER BY created_at DESC`,
      [userId, ownerType]
    );
    const total = all.length;
    const withdrawalRequests = all.slice((page - 1) * limit, page * limit);

    res.status(200).json({ success: true, withdrawalRequests, totalPages: Math.ceil(total / limit), currentPage: page, total });
  } catch (error) {
    console.error('Get withdrawal requests error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
};

exports.cancelWithdrawalRequest = async (req, res) => {
  try {
    const userId = String(req.user.userId || req.user.id || req.user._id);
    const { requestId } = req.params;

    const { rows: [wr] } = await query(
      `SELECT * FROM withdrawal_requests WHERE id=$1 AND user_id=$2`, [requestId, userId]
    );
    if (!wr) return res.status(404).json({ error: 'Withdrawal request not found' });
    if (wr.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled' });

    await WithdrawalRequest.update(requestId, { status: 'cancelled' });
    res.status(200).json({ success: true, message: 'Withdrawal request cancelled successfully' });
  } catch (error) {
    console.error('Cancel withdrawal error:', error);
    res.status(500).json({ error: 'Failed to cancel withdrawal request' });
  }
};

exports.getAllWithdrawalRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, ownerType } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (ownerType) filter.ownerType = ownerType;

    // Build query manually since findAll doesn't support multi-filter
    let q = `SELECT wr.*, w.balance AS wallet_balance, w.owner_email AS wallet_email
             FROM withdrawal_requests wr
             LEFT JOIN wallets w ON w.id = wr.wallet_id`;
    const vals = [];
    const conditions = [];
    if (status) { conditions.push(`wr.status = $${vals.length+1}`); vals.push(status); }
    if (ownerType) { conditions.push(`wr.owner_type = $${vals.length+1}`); vals.push(ownerType); }
    if (conditions.length) q += ` WHERE ${conditions.join(' AND ')}`;
    q += ` ORDER BY wr.created_at DESC`;

    const { rows: all } = await query(q, vals);
    const total = all.length;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const withdrawalRequests = all.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.status(200).json({ success: true, withdrawalRequests, totalPages: Math.ceil(total / limitNum), currentPage: pageNum, total });
  } catch (error) {
    console.error('Get all withdrawal requests error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
};

exports.processWithdrawalRequest = async (req, res) => {
  const client = await getClient();
  try {
    const adminId = String(req.user.userId || req.user.id || req.user._id);
    const { requestId } = req.params;
    const { action, adminNotes, rejectionReason } = req.body;

    if (!['approve', 'reject', 'complete'].includes(action))
      return res.status(400).json({ error: 'Invalid action' });

    await client.query('BEGIN');

    const { rows: [wr] } = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id=$1 FOR UPDATE`, [requestId]
    );
    if (!wr) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Withdrawal request not found' }); }
    if (wr.status !== 'pending' && action === 'approve') {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'Only pending requests can be approved' });
    }
    if (wr.status !== 'approved' && action === 'complete') {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'Only approved requests can be completed' });
    }

    const wallet = await Wallet.findById(wr.wallet_id);
    if (!wallet) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Wallet not found' }); }

    let updateFields = { processedBy: adminId, processedAt: new Date() };
    if (adminNotes) updateFields.adminNotes = adminNotes;

    if (action === 'reject') {
      updateFields.status = 'rejected';
      updateFields.rejectionReason = rejectionReason || 'Not specified';

    } else if (action === 'approve') {
      if (wallet.balance < wr.amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient wallet balance', currentBalance: wallet.balance });
      }
      updateFields.status = 'approved';

    } else if (action === 'complete') {
      // Deduct from wallet
      await client.query(
        `UPDATE wallets SET balance=balance-$1, total_spent=COALESCE(total_spent,0)+$1, last_updated=NOW() WHERE id=$2`,
        [wr.amount, wallet.id]
      );
      // Create transaction record
      const tx = await WalletTransaction.create({
        walletId: wallet.id,
        paymentId: wr.id,
        adId: null,
        amount: -wr.amount,
        type: 'debit',
        description: `Withdrawal to ${JSON.parse(wr.bank_details || '{}').bankName} - ${JSON.parse(wr.bank_details || '{}').accountNumber}`,
        status: 'completed'
      });
      updateFields.status = 'completed';
      updateFields.transactionId = tx.id;
    }

    const updated = await WithdrawalRequest.update(requestId, updateFields);
    await client.query('COMMIT');

    res.status(200).json({ success: true, message: `Withdrawal request ${action}d successfully`, withdrawalRequest: updated });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Process withdrawal error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal request' });
  } finally {
    client.release();
  }
};

module.exports = exports;
