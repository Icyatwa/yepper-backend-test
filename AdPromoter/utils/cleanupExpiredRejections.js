// utils/cleanupExpiredRejections.js
const ImportAd = require('../models/WebAdvertiseModel');

const cleanupExpiredRejections = async () => {
  try {
    const now = new Date();
    
    // Find ads with expired rejection deadlines that are still pending
    const expiredAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          approved: true,
          isRejected: false,
          rejectionDeadline: { $lt: now }
        }
      }
    });

    for (const ad of expiredAds) {
      let updated = false;
      
      for (let selection of ad.websiteSelections) {
        if (selection.approved && !selection.isRejected && selection.rejectionDeadline < now) {
          selection.rejectionDeadline = null; // Clear expired deadline
          updated = true;
        }
      }
      
      if (updated) {
        await ad.save();
      }
    }
    
    console.log(`Cleaned up ${expiredAds.length} ads with expired rejection deadlines`);
  } catch (error) {
    console.error('Error cleaning up expired rejections:', error);
  }
};

// Run every 5 minutes
setInterval(cleanupExpiredRejections, 5 * 60 * 1000);

module.exports = { cleanupExpiredRejections };