// AdApprovalJob.js — PostgreSQL version
const cron = require('node-cron');
const { query } = require('../../config/db');

const autoApproveExpiredAds = async () => {
  try {
    console.log('Running auto-approval job...');
    const now = new Date();

    const { rows: adsToProcess } = await query(
      `SELECT id, website_selections FROM import_ads
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(website_selections) sel
         WHERE sel->>'status' = 'pending_approval'
           AND (sel->>'canBeRejected')::boolean = true
           AND (sel->>'rejectionWindow')::timestamptz < $1
       )`,
      [now]
    );

    let approvedCount = 0;
    for (const ad of adsToProcess) {
      const selections = Array.isArray(ad.website_selections)
        ? ad.website_selections
        : JSON.parse(ad.website_selections || '[]');

      let modified = false;
      for (const sel of selections) {
        if (sel.status === 'pending_approval' && sel.canBeRejected && new Date(sel.rejectionWindow) < now) {
          sel.status       = 'active';
          sel.approved     = true;
          sel.approvedAt   = now;
          sel.canBeRejected = false;
          modified = true;
          approvedCount++;
        }
      }

      if (modified) {
        const allApproved = selections.every(s => s.approved);
        await query(
          `UPDATE import_ads SET website_selections=$1, confirmed=$2 WHERE id=$3`,
          [JSON.stringify(selections), allApproved, ad.id]
        );
      }
    }

    console.log(`Auto-approved ${approvedCount} ad selections`);
  } catch (error) {
    console.error('Error in auto-approval job:', error);
  }
};

const scheduleAutoApproval = () => {
  cron.schedule('*/30 * * * * *', autoApproveExpiredAds);
  console.log('Auto-approval job scheduled to run every 30 seconds');
};

module.exports = { autoApproveExpiredAds, scheduleAutoApproval };
