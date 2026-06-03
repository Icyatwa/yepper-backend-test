// models/Conversation.js (PostgreSQL)
const { query } = require('../config/db');

const Conversation = {
  async create({ userId, title, messages = [] }) {
    const { rows } = await query(
      `INSERT INTO conversations (user_id, title, messages) VALUES ($1,$2,$3) RETURNING *`,
      [userId, title, JSON.stringify(messages)]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM conversations WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByUser(userId) {
    const { rows } = await query(`SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC`, [userId]);
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE conversations SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => typeof fields[k] === 'object' ? JSON.stringify(fields[k]) : fields[k])]
    );
    return rows[0] || null;
  },
  async delete(id) {
    await query(`DELETE FROM conversations WHERE id = $1`, [id]);
  },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = Conversation;
