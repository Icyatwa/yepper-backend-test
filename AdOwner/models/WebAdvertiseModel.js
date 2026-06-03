// AdOwner/models/WebAdvertiseModel.js (PostgreSQL)
const { query } = require('../../config/db');

const ImportAd = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO import_ads (user_id, ad_owner_email, image_url, pdf_url, video_url, business_name,
        business_link, business_location, ad_description, website_selections)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [data.userId, data.adOwnerEmail, data.imageUrl||null, data.pdfUrl||null, data.videoUrl||null,
       data.businessName, data.businessLink, data.businessLocation, data.adDescription,
       JSON.stringify(data.websiteSelections||[])]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM import_ads WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByUser(userId) {
    const { rows } = await query(`SELECT * FROM import_ads WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  },
  async findAll() {
    const { rows } = await query(`SELECT * FROM import_ads ORDER BY created_at DESC`);
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(id);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const vals = keys.map(k => typeof fields[k]==='object'&&fields[k]!==null ? JSON.stringify(fields[k]) : fields[k]);
    const { rows } = await query(
      `UPDATE import_ads SET ${setClauses} WHERE id = $1 RETURNING *`, [id, ...vals]
    );
    return rows[0] || null;
  },
  async incrementClicks(id) {
    const { rows } = await query(`UPDATE import_ads SET clicks = clicks + 1 WHERE id = $1 RETURNING *`, [id]);
    return rows[0];
  },
  async incrementViews(id) {
    const { rows } = await query(`UPDATE import_ads SET views = views + 1 WHERE id = $1 RETURNING *`, [id]);
    return rows[0];
  },
  async delete(id) { await query(`DELETE FROM import_ads WHERE id = $1`, [id]); },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = ImportAd;
