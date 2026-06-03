// AdPromoter/models/walletModel.js (PostgreSQL)
const { query, getClient } = require('../../config/db');

const Wallet = {
  async create({ ownerId, ownerEmail, ownerType }) {
    const { rows } = await query(
      `INSERT INTO wallets (owner_id, owner_email, owner_type) VALUES ($1,$2,$3)
       ON CONFLICT (owner_id, owner_type) DO UPDATE SET owner_email = EXCLUDED.owner_email
       RETURNING *`,
      [ownerId, ownerEmail, ownerType]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM wallets WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByOwner(ownerId, ownerType) {
    const { rows } = await query(`SELECT * FROM wallets WHERE owner_id = $1 AND owner_type = $2`, [ownerId, ownerType]);
    return rows[0] || null;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(id);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE wallets SET ${setClauses}, updated_at = NOW(), last_updated = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k=>fields[k])]
    );
    return rows[0] || null;
  },
  async findAll() {
    const { rows } = await query(`SELECT * FROM wallets ORDER BY created_at DESC`);
    return rows;
  },
};

const WalletTransaction = {
  async create({ walletId, paymentId, adId, amount, type, description, status = 'completed', transactionHash }) {
    const { rows } = await query(
      `INSERT INTO wallet_transactions (wallet_id, payment_id, ad_id, amount, type, description, status, transaction_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [walletId, paymentId||null, adId||null, amount, type, description, status, transactionHash||null]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM wallet_transactions WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByWallet(walletId) {
    const { rows } = await query(`SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC`, [walletId]);
    return rows;
  },
};

function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = { Wallet, WalletTransaction };
