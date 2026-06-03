// AdPromoter/models/WithdrawalModel.js (PostgreSQL)
const { query } = require('../../config/db');

const WithdrawalRequest = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO withdrawal_requests (wallet_id, user_id, user_email, owner_type, amount, bank_details, wallet_balance_at_request)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.walletId, data.userId, data.userEmail, data.ownerType, data.amount,
       JSON.stringify(data.bankDetails), data.walletBalanceAtRequest]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM withdrawal_requests WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByUser(userId) {
    const { rows } = await query(`SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  },
  async findAll(filter = {}) {
    let q = `SELECT * FROM withdrawal_requests`;
    const vals = [];
    if (filter.status) { q += ` WHERE status = $1`; vals.push(filter.status); }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await query(q, vals);
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE withdrawal_requests SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k=>fields[k])]
    );
    return rows[0] || null;
  },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = WithdrawalRequest;
