// AdOwner/models/PaymentTracker.js (PostgreSQL)
const { query } = require('../../config/db');

const PaymentTracker = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO payment_trackers (user_id, ad_id, category_id, payment_date, amount, views_required, payment_reference, test_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.userId, data.adId||null, data.categoryId||null, data.paymentDate, data.amount, data.viewsRequired, data.paymentReference||null, data.testMode||false]
    );
    return rows[0];
  },
  async findByReference(ref) {
    const { rows } = await query(`SELECT * FROM payment_trackers WHERE payment_reference = $1`, [ref]);
    return rows[0] || null;
  },
  async findByUser(userId) {
    const { rows } = await query(`SELECT * FROM payment_trackers WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE payment_trackers SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k=>fields[k])]
    );
    return rows[0] || null;
  },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = PaymentTracker;
