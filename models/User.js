// models/User.js  (PostgreSQL version)
const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

const User = {
  async create({ name, email, password, googleId, avatar = '', isVerified = false, verificationToken = null, verificationTokenExpires = null, gscAccessToken = null, gscRefreshToken = null }) {
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }
    const { rows } = await query(
      `INSERT INTO users (name, email, password, google_id, avatar, is_verified, verification_token, verification_token_expires, gsc_access_token, gsc_refresh_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, email.toLowerCase().trim(), hashedPassword, googleId||null, avatar, isVerified, verificationToken, verificationTokenExpires, gscAccessToken, gscRefreshToken]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findByEmail(email) {
    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    return rows[0] || null;
  },

  async findByGoogleId(googleId) {
    const { rows } = await query(`SELECT * FROM users WHERE google_id = $1`, [googleId]);
    return rows[0] || null;
  },

  async findByVerificationToken(token) {
    const { rows } = await query(`SELECT * FROM users WHERE verification_token = $1`, [token]);
    return rows[0] || null;
  },

  async findByResetToken(token) {
    const { rows } = await query(
      `SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()`, [token]
    );
    return rows[0] || null;
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(id);
    const setClauses = keys.map((k, i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE users SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => fields[k])]
    );
    return rows[0] || null;
  },

  async updatePassword(id, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);
    const { rows } = await query(
      `UPDATE users SET password = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, hashed]
    );
    return rows[0] || null;
  },

  async comparePassword(user, candidatePassword) {
    if (!user.password) return false;
    return bcrypt.compare(candidatePassword, user.password);
  },

  async findAll() {
    const { rows } = await query(`SELECT * FROM users ORDER BY created_at DESC`);
    return rows;
  },

  async delete(id) {
    await query(`DELETE FROM users WHERE id = $1`, [id]);
  },
};

function toSnake(str) {
  return str.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}

module.exports = User;
