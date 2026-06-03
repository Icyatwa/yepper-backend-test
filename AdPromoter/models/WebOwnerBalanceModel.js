// AdPromoter/models/WebOwnerBalanceModel.js (PostgreSQL)
const { query } = require('../../config/db');

const WebOwnerBalance = {
  async findOrCreate(userId) {
    const { rows } = await query(
      `INSERT INTO web_owner_balances (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [userId]
    );
    return rows[0];
  },
  async findByUser(userId) {
    const { rows } = await query(`SELECT * FROM web_owner_balances WHERE user_id = $1`, [userId]);
    return rows[0] || null;
  },
  async update(userId, fields) {
    const keys = Object.keys(fields);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE web_owner_balances SET ${setClauses}, updated_at = NOW() WHERE user_id = $1 RETURNING *`,
      [userId, ...keys.map(k=>fields[k])]
    );
    return rows[0] || null;
  },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = WebOwnerBalance;
