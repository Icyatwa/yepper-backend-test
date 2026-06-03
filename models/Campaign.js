// models/Campaign.js (PostgreSQL)
const { query } = require('../config/db');

const Campaign = {
  async create({ userId, fullName, businessName, phoneNumber, selectedChannels, selectedPlatforms = [], status = 'pending', notes }) {
    const { rows } = await query(
      `INSERT INTO campaigns (user_id, full_name, business_name, phone_number, selected_channels, selected_platforms, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, fullName, businessName, phoneNumber, selectedChannels, JSON.stringify(selectedPlatforms), status, notes||null]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByUser(userId) {
    const { rows } = await query(`SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  },
  async findAll(filters = {}) {
    let q = `SELECT * FROM campaigns`;
    const vals = [];
    if (filters.status) { q += ` WHERE status = $1`; vals.push(filters.status); }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await query(q, vals);
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE campaigns SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => typeof fields[k]==='object'?JSON.stringify(fields[k]):fields[k])]
    );
    return rows[0] || null;
  },
  async delete(id) { await query(`DELETE FROM campaigns WHERE id = $1`, [id]); },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = Campaign;
