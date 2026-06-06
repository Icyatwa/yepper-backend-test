// AdOwner/models/WebAdvertiseModel.js (PostgreSQL)
const { query, getClient } = require('../../config/db');

const ImportAd = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO import_ads (user_id, ad_owner_email, image_url, pdf_url, video_url, business_name,
        business_link, business_location, ad_description, website_selections, confirmed, clicks, views,
        available_for_reassignment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [data.userId, data.adOwnerEmail, data.imageUrl||null, data.pdfUrl||null, data.videoUrl||null,
       data.businessName, data.businessLink||null, data.businessLocation||null, data.adDescription||null,
       JSON.stringify(data.websiteSelections||[]), data.confirmed||true,
       data.clicks||0, data.views||0, data.availableForReassignment||false]
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

  async findByUserWithFilters(userId, filters = {}) {
    let q = `SELECT * FROM import_ads WHERE user_id = $1`;
    const vals = [userId];
    if (filters.availableForReassignment !== undefined) {
      q += ` AND available_for_reassignment = $${vals.length+1}`;
      vals.push(filters.availableForReassignment);
    }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await query(q, vals);
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
      `UPDATE import_ads SET ${setClauses} WHERE id = $1 RETURNING *`,
      [id, ...vals]
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

  // Find ads where any websiteSelection is active and references one of the given category IDs
  async findActiveByCategories(categoryIds) {
    if (!categoryIds || categoryIds.length === 0) return [];
    const ids = categoryIds.map(String);
    const { rows } = await query(
      `SELECT DISTINCT * FROM import_ads
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(website_selections) AS sel
         WHERE (sel->>'approved')::boolean = true
           AND (sel->>'isRejected')::boolean = false
           AND sel->>'status' = 'active'
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(sel->'categories') cat_id
             WHERE cat_id = ANY($1::text[])
           )
       )`,
      [ids]
    );
    return rows.map(rowToAd);
  },

  // Find ads where any websiteSelection is within the rejection window for the given categories
  async findPendingByCategories(categoryIds, now) {
    if (!categoryIds || categoryIds.length === 0) return [];
    const ids = categoryIds.map(String);
    const { rows } = await query(
      `SELECT DISTINCT * FROM import_ads
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(website_selections) AS sel
         WHERE (sel->>'approved')::boolean = true
           AND (sel->>'isRejected')::boolean = false
           AND (sel->>'rejectionDeadline')::timestamptz > $2
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(sel->'categories') cat_id
             WHERE cat_id = ANY($1::text[])
           )
       )`,
      [ids, now]
    );
    return rows.map(rowToAd);
  },

  async countByUser(userId) {
    const { rows } = await query(`SELECT COUNT(*) FROM import_ads WHERE user_id = $1`, [userId]);
    return parseInt(rows[0].count, 10);
  },
};

function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }

// Maps a raw PostgreSQL snake_case row to the camelCase shape the frontend expects
function rowToAd(row) {
  if (!row) return null;
  const sel = row.website_selections;
  return {
    id:                       row.id,
    _id:                      row.id,
    userId:                   row.user_id,
    adOwnerEmail:             row.ad_owner_email,
    imageUrl:                 row.image_url,
    pdfUrl:                   row.pdf_url,
    videoUrl:                 row.video_url,
    businessName:             row.business_name,
    businessLink:             row.business_link,
    businessLocation:         row.business_location,
    adDescription:            row.ad_description,
    websiteSelections:        Array.isArray(sel) ? sel
                                : (typeof sel === 'string' ? JSON.parse(sel) : []),
    confirmed:                row.confirmed,
    clicks:                   row.clicks,
    views:                    row.views,
    availableForReassignment: row.available_for_reassignment,
    createdAt:                row.created_at,
    updatedAt:                row.updated_at,
  };
}

module.exports = ImportAd;