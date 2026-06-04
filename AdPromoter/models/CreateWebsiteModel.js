// AdPromoter/models/CreateWebsiteModel.js (PostgreSQL)
const { query } = require('../../config/db');

const Website = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO websites (owner_id, website_name, website_link, image_url, business_categories,
        is_business_categories_selected, monthly_traffic, traffic_tier, site_script,
        verification_token, verification_status, verified_at, gsc_access_token, gsc_refresh_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        data.ownerId,
        data.websiteName,
        data.websiteLink,
        data.imageUrl || null,
        JSON.stringify(data.businessCategories || []),
        data.isBusinessCategoriesSelected || false,
        data.monthlyTraffic || 0,
        data.trafficTier || 'unverified',
        data.siteScript || null,
        data.verificationToken || null,
        data.verificationStatus || 'pending',
        data.verifiedAt || null,
        data.gscAccessToken || null,
        data.gscRefreshToken || null,
      ]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await query(`SELECT * FROM websites WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findByOwner(ownerId) {
    const { rows } = await query(
      `SELECT * FROM websites WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]
    );
    return rows;
  },

  async findByLink(link) {
    const { rows } = await query(`SELECT * FROM websites WHERE website_link = $1`, [link]);
    return rows[0] || null;
  },

  // Used by initiateVerification to reuse a pending token for the same owner+link
  async findByOwnerAndLink(ownerId, link) {
    const { rows } = await query(
      `SELECT * FROM websites WHERE owner_id = $1 AND website_link = $2`, [ownerId, link]
    );
    return rows[0] || null;
  },

  async findAll() {
    const { rows } = await query(`SELECT * FROM websites ORDER BY created_at DESC`);
    return rows;
  },

  async update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(id);
    const setClauses = keys.map((k, i) => `${toSnake(k)} = $${i + 2}`).join(', ');
    const vals = keys.map(k => {
      const v = fields[k];
      // Serialize arrays to JSON for PostgreSQL
      if (Array.isArray(v)) return JSON.stringify(v);
      return v;
    });
    const { rows } = await query(
      `UPDATE websites SET ${setClauses} WHERE id = $1 RETURNING *`,
      [id, ...vals]
    );
    return rows[0] || null;
  },

  async delete(id) {
    await query(`DELETE FROM websites WHERE id = $1`, [id]);
  },
};

function toSnake(s) { return s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`); }
module.exports = Website;