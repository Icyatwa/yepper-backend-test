// AdPromoter/models/WebsiteAnalyticsModel.js (PostgreSQL)
const { query } = require('../../config/db');

const WebsitePageView = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO website_page_views (website_id, ip, country, country_code, city, region, lat, lon, device, referrer, path, is_granted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.websiteId, data.ip||'', data.country||'Unknown', data.countryCode||'',
       data.city||'Unknown', data.region||'', data.lat||null, data.lon||null,
       data.device||'unknown', data.referrer||'', data.path||'/', data.isGranted||false]
    );
    return rows[0];
  },
  async findByWebsite(websiteId, limit = 1000) {
    const { rows } = await query(
      `SELECT * FROM website_page_views WHERE website_id = $1 ORDER BY timestamp DESC LIMIT $2`,
      [websiteId, limit]
    );
    return rows;
  },
  async countByWebsite(websiteId, since) {
    const { rows } = await query(
      `SELECT COUNT(*) FROM website_page_views WHERE website_id = $1 AND timestamp > $2`,
      [websiteId, since]
    );
    return parseInt(rows[0].count, 10);
  },
  async groupByCountry(websiteId) {
    const { rows } = await query(
      `SELECT country, country_code, COUNT(*) as count FROM website_page_views
       WHERE website_id = $1 GROUP BY country, country_code ORDER BY count DESC`,
      [websiteId]
    );
    return rows;
  },
};
module.exports = WebsitePageView;
