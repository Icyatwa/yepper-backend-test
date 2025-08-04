// 4. Create scheduled job - AdApprovalJob.js
const cron = require('node-cron');
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const mongoose = require('mongoose');

// Function to auto-approve ads after rejection window expires
const autoApproveExpiredAds = async () => {
  const session = await mongoose.startSession();
  
  try {
    console.log('Running auto-approval job for expired rejection windows...');
    
    const now = new Date();
    
    await session.withTransaction(async () => {
      // Find all ads with expired rejection windows that are still pending approval
      const adsToApprove = await ImportAd.find({
        'websiteSelections': {
          $elemMatch: {
            status: 'pending_approval',
            rejectionWindow: { $lt: now },
            canBeRejected: true
          }
        }
      }).session(session);

      let approvedCount = 0;

      for (const ad of adsToApprove) {
        let adModified = false;
        
        for (const selection of ad.websiteSelections) {
          if (
            selection.status === 'pending_approval' &&
            selection.rejectionWindow < now &&
            selection.canBeRejected
          ) {
            selection.status = 'active';
            selection.approved = true;
            selection.approvedAt = now;
            selection.canBeRejected = false;
            adModified = true;
            approvedCount++;
          }
        }

        if (adModified) {
          // Check if all selections are now approved
          const allApproved = ad.websiteSelections.every(sel => sel.approved);
          if (allApproved) {
            ad.confirmed = true;
          }
          
          await ad.save({ session });
        }
      }

      console.log(`Auto-approved ${approvedCount} ad selections`);
    });

  } catch (error) {
    console.error('Error in auto-approval job:', error);
  } finally {
    await session.endSession();
  }
};

// Run every 30 seconds for testing (adjust as needed)
const scheduleAutoApproval = () => {
  cron.schedule('*/30 * * * * *', autoApproveExpiredAds);
  console.log('Auto-approval job scheduled to run every 30 seconds');
};

module.exports = {
  autoApproveExpiredAds,
  scheduleAutoApproval
};