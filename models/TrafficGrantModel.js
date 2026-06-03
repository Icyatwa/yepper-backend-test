// models/TrafficGrantModel.js (PostgreSQL)
const { query } = require('../config/db');

const TrafficGrant = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO traffic_grants (user_id, website_id, granted_traffic, granted_views, access_token, granted_by, expires_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.userId, data.websiteId||null, data.grantedTraffic||null, data.grantedViews||null,
       data.accessToken, data.grantedBy, data.expiresAt, data.notes||'']
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM traffic_grants WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByToken(token) {
    const { rows } = await query(`SELECT * FROM traffic_grants WHERE access_token = $1`, [token]);
    return rows[0] || null;
  },
  async findByUser(userId) {
    const { rows } = await query(`SELECT * FROM traffic_grants WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE traffic_grants SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k=>fields[k])]
    );
    return rows[0] || null;
  },
  async expireOld() {
    return query(`UPDATE traffic_grants SET status='expired' WHERE expires_at < NOW() AND status='pending'`);
  },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = TrafficGrant;
