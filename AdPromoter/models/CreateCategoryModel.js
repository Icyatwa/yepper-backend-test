// AdPromoter/models/CreateCategoryModel.js (PostgreSQL)
const { query } = require('../../config/db');

const AdCategory = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO ad_categories (owner_id, website_id, category_name, description, price, space_type,
        instructions, default_language, custom_attributes, placement_mode, placeholder_div,
        api_codes, web_owner_email, visitor_range_min, visitor_range_max, tier, customization)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [data.ownerId, data.websiteId, data.categoryName, data.description||null, data.price,
       data.spaceType, data.instructions||null, data.defaultLanguage||'english',
       JSON.stringify(data.customAttributes||{}), data.placementMode||'auto',
       data.placeholderDiv||null, JSON.stringify(data.apiCodes||{}),
       data.webOwnerEmail, data.visitorRange?.min, data.visitorRange?.max,
       data.tier, data.customization ? JSON.stringify(data.customization) : null]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM ad_categories WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByOwner(ownerId) {
    const { rows } = await query(`SELECT * FROM ad_categories WHERE owner_id = $1 ORDER BY created_at DESC`, [ownerId]);
    return rows;
  },
  async findByWebsite(websiteId) {
    const { rows } = await query(`SELECT * FROM ad_categories WHERE website_id = $1 ORDER BY created_at DESC`, [websiteId]);
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(id);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const vals = keys.map(k => typeof fields[k]==='object'&&fields[k]!==null ? JSON.stringify(fields[k]) : fields[k]);
    const { rows } = await query(
      `UPDATE ad_categories SET ${setClauses} WHERE id = $1 RETURNING *`, [id, ...vals]
    );
    return rows[0] || null;
  },
  async delete(id) { await query(`DELETE FROM ad_categories WHERE id = $1`, [id]); },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = AdCategory;
