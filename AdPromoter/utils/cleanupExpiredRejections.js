// cleanupExpiredRejections.js — PostgreSQL version
const { query } = require('../../config/db');

const cleanupExpiredRejections = async () => {
  try {
    const now = new Date();

    // Find ads with selections that have expired rejection deadlines
    const { rows: expiredAds } = await query(
      `SELECT id, website_selections FROM import_ads
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(website_selections) sel
         WHERE (sel->>'approved')::boolean = true
           AND (sel->>'isRejected')::boolean = false
           AND (sel->>'rejectionDeadline') IS NOT NULL
           AND (sel->>'rejectionDeadline')::timestamptz < $1
       )`,
      [now]
    );

    let updatedCount = 0;
    for (const ad of expiredAds) {
      const selections = Array.isArray(ad.website_selections)
        ? ad.website_selections
        : JSON.parse(ad.website_selections || '[]');

      let modified = false;
      for (const sel of selections) {
        if (sel.approved && !sel.isRejected && sel.rejectionDeadline && new Date(sel.rejectionDeadline) < now) {
          sel.rejectionDeadline = null;
          modified = true;
        }
      }
      if (modified) {
        await query(`UPDATE import_ads SET website_selections=$1 WHERE id=$2`, [JSON.stringify(selections), ad.id]);
        updatedCount++;
      }
    }

    console.log(`Cleaned up ${updatedCount} ads with expired rejection deadlines`);
  } catch (error) {
    console.error('Error cleaning up expired rejections:', error);
  }
};

setInterval(cleanupExpiredRejections, 5 * 60 * 1000);

module.exports = { cleanupExpiredRejections };
