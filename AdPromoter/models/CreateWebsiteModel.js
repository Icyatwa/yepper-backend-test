// AdPromoter/models/CreateWebsiteModel.js (PostgreSQL)
const { query } = require('../../config/db');

const Website = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO websites (owner_id, website_name, website_link, image_url, business_categories,
        is_business_categories_selected, monthly_traffic, traffic_tier, site_script,
        verification_token, verification_status, gsc_access_token, gsc_refresh_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [data.ownerId, data.websiteName, data.websiteLink, data.imageUrl||null,
       data.businessCategories||[], data.isBusinessCategoriesSelected||false,
       data.monthlyTraffic||0, data.trafficTier||'unverified', data.siteScript||null,
       data.verificationToken||null, data.verificationStatus||'pending',
       data.gscAccessToken||null, data.gscRefreshToken||null]
    );
    return rowToCamel(rows[0]);
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM websites WHERE id = $1`, [id]);
    return rowToCamel(rows[0] || null);  // ← add this
  },
  async findByOwner(ownerId) {
    const { rows } = await query(`SELECT * FROM websites WHERE owner_id = $1 ...`, [ownerId]);
    return rows.map(rowToCamel);   // ← add this
  },
  async findByLink(link) {
    const { rows } = await query(`SELECT * FROM websites WHERE website_link = $1`, [link]);
    return rowToCamel(rows[0] || null);  // ← add this
  },
  async findByLink(link) {
    const { rows } = await query(`SELECT * FROM websites WHERE website_link = $1`, [link]);
    return rowToCamel(rows[0] || null);  // ← add this
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(id);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const { rows } = await query(
      `UPDATE websites SET ${setClauses} WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k=>fields[k])]
    );
    return rowToCamel(rows[0] || null);
  },
  async delete(id) { await query(`DELETE FROM websites WHERE id = $1`, [id]); },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToCamel(row) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [toCamel(k), v])
  );
}
module.exports = Website;
