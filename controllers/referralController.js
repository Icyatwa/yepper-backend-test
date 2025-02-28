// controllers/referralController.js
const ReferralCode = require('../models/ReferralCode');
const Referral = require('../models/Referral');
const Website = require('../models/WebsiteModel');
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');
const { createLogger } = require('../utils/logger');
const logger = createLogger('referralController');

function generateUniqueCode(length = 8) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

function calculateReferralProgress(referral) {
  let totalSteps = 0;
  let completedSteps = 0;
  
  // Define required steps based on user type
  if (referral.userType === 'website_owner') {
    totalSteps = 2; // Website creation + Category creation
    if (referral.websiteDetails && referral.websiteDetails.length > 0) completedSteps++;
    if (referral.categoryDetails && referral.categoryDetails.length > 0) completedSteps++;
  } else if (referral.userType === 'advertiser') {
    totalSteps = 1; // Import ad creation
    // Check ad creation (determined elsewhere)
  }
  
  return Math.round((completedSteps / totalSteps) * 100);
}

const referralController = {
  async generateCode(req, res) {
    try {
      const { userId, userType } = req.body;
      
      if (!userId || !userType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: userId and userType are required'
        });
      }
      
      // Find existing code or create new one
      let referralCode = await ReferralCode.findOne({ userId });
      
      if (!referralCode) {
        let code;
        let isUnique = false;
        
        // Generate a unique code
        while (!isUnique) {
          code = generateUniqueCode();
          const existing = await ReferralCode.findOne({ code });
          if (!existing) {
            isUnique = true;
          }
        }
        
        // Create the new referral code
        referralCode = await ReferralCode.create({
          userId,
          code,
          userType,
          totalReferrals: 0,
          totalQualifiedReferrals: 0,
          lastUpdated: new Date()
        });
        
        logger.info(`New referral code generated for user ${userId}: ${code}`);
      }
      
      res.json({ 
        success: true, 
        referralCode: {
          code: referralCode.code,
          userId: referralCode.userId,
          totalReferrals: referralCode.totalReferrals,
          qualifiedReferrals: referralCode.totalQualifiedReferrals
        }
      });
    } catch (error) {
      logger.error('Error generating referral code:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },
  
  async recordReferral(req, res) {
    try {
      const { referralCode, referredUserId, userType, referredUserDetails } = req.body;
      
      if (!referralCode || !referredUserId || !userType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: referralCode, referredUserId, and userType are required'
        });
      }
      
      // Validate the referral code
      const referrerCode = await ReferralCode.findOne({ code: referralCode });
      if (!referrerCode) {
        return res.status(404).json({
          success: false,
          error: 'Invalid referral code'
        });
      }
      
      // Check if this user was already referred
      const existingReferral = await Referral.findOne({ referredUserId });
      if (existingReferral) {
        return res.status(409).json({
          success: false,
          error: 'User has already been referred',
          referral: existingReferral
        });
      }
      
      // Create the referral record
      const referral = await Referral.create({
        referrerId: referrerCode.userId,
        referredUserId,
        referralCode,
        userType,
        referredUserDetails,
        status: 'pending',
        completionProgress: 0,
        lastUpdated: new Date()
      });
      
      // Increment the total referrals counter
      await ReferralCode.updateOne(
        { _id: referrerCode._id },
        { 
          $inc: { totalReferrals: 1 },
          $set: { lastUpdated: new Date() }
        }
      );
      
      logger.info(`Referral recorded: User ${referredUserId} referred by ${referrerCode.userId}`);
      
      res.json({ 
        success: true, 
        message: 'Referral recorded successfully',
        referral
      });
    } catch (error) {
      logger.error('Error recording referral:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  async updateWebsiteCreation(userId, websiteId, websiteName, websiteLink) {
    try {
      // Find the referral for this user
      const referral = await Referral.findOne({ 
        referredUserId: userId,
        status: { $in: ['pending', 'website_created'] }
      });
      
      if (!referral) {
        logger.info(`No pending referral found for user ${userId} when creating website`);
        return null;
      }
      
      // Update the referral with website details
      referral.websiteDetails.push({
        websiteId,
        websiteName,
        websiteLink,
        createdAt: new Date()
      });
      
      referral.status = 'website_created';
      referral.completionProgress = calculateReferralProgress(referral);
      referral.lastUpdated = new Date();
      
      await referral.save();
      logger.info(`Referral updated with website creation for user ${userId}`);
      
      return referral;
    } catch (error) {
      logger.error(`Error updating referral with website creation for user ${userId}:`, error);
      return null;
    }
  },

  async updateCategoryCreation(userId, categoryId, categoryName) {
    try {
      // Find the referral for this user
      const referral = await Referral.findOne({ 
        referredUserId: userId,
        status: { $in: ['pending', 'website_created', 'category_created'] }
      });
      
      if (!referral) {
        logger.info(`No pending referral found for user ${userId} when creating category`);
        return null;
      }
      
      // Update the referral with category details
      referral.categoryDetails.push({
        categoryId,
        categoryName,
        createdAt: new Date()
      });
      
      // Check if this completes the qualification requirements
      const hasWebsite = referral.websiteDetails && referral.websiteDetails.length > 0;
      
      if (hasWebsite) {
        // User has created both website and category - qualify the referral
        referral.status = 'qualified';
        referral.qualifiedAt = new Date();
        
        // Update the referrer's qualified referral count
        await ReferralCode.updateOne(
          { userId: referral.referrerId },
          { 
            $inc: { totalQualifiedReferrals: 1 },
            $set: { lastUpdated: new Date() }
          }
        );
        
        logger.info(`Referral qualified for user ${userId}`);
      } else {
        referral.status = 'category_created';
        logger.info(`Referral updated with category creation for user ${userId}`);
      }
      
      referral.completionProgress = calculateReferralProgress(referral);
      referral.lastUpdated = new Date();
      await referral.save();
      
      return referral;
    } catch (error) {
      logger.error(`Error updating referral with category creation for user ${userId}:`, error);
      return null;
    }
  },

  async completeReferral(req, res) {
    try {
      const { referredUserId } = req.body;
      
      if (!referredUserId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: referredUserId'
        });
      }
      
      const referral = await Referral.findOne({ 
        referredUserId, 
        status: { $ne: 'qualified' }
      });
      
      if (!referral) {
        return res.status(404).json({
          success: false,
          error: 'No pending referral found for this user'
        });
      }
      
      // Update referral status
      referral.status = 'qualified';
      referral.qualifiedAt = new Date();
      referral.completionProgress = 100;
      referral.lastUpdated = new Date();
      await referral.save();
      
      // Update referrer's stats
      await ReferralCode.updateOne(
        { userId: referral.referrerId },
        { 
          $inc: { totalQualifiedReferrals: 1 },
          $set: { lastUpdated: new Date() }
        }
      );
      
      logger.info(`Referral manually completed for user ${referredUserId}`);
      
      res.json({ 
        success: true, 
        message: 'Referral qualified successfully',
        referral 
      });
    } catch (error) {
      logger.error('Error completing referral:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  async getReferralStats(req, res) {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: userId'
        });
      }
      
      // Get referral code and referrals
      const [referralCode, referrals] = await Promise.all([
        ReferralCode.findOne({ userId }).lean(),
        Referral.find({ referrerId: userId })
          .sort({ createdAt: -1 })
          .lean()
      ]);
      
      if (!referralCode) {
        return res.status(404).json({
          success: false,
          error: 'No referral code found for this user'
        });
      }
      
      // Prepare statistics
      const stats = {
        code: referralCode.code,
        totalReferrals: referralCode.totalReferrals,
        qualifiedReferrals: referralCode.totalQualifiedReferrals,
        pendingReferrals: referrals.filter(r => r.status !== 'qualified').length,
        conversionRate: referralCode.totalReferrals > 0 
          ? Math.round((referralCode.totalQualifiedReferrals / referralCode.totalReferrals) * 100) 
          : 0,
        referrals: referrals.map(ref => ({
          userId: ref.referredUserId,
          status: ref.status,
          progress: ref.completionProgress,
          userDetails: ref.referredUserDetails,
          websiteDetails: ref.websiteDetails,
          categoryDetails: ref.categoryDetails,
          createdAt: ref.createdAt,
          qualifiedAt: ref.qualifiedAt,
          daysSinceCreation: Math.floor((new Date() - new Date(ref.createdAt)) / (1000 * 60 * 60 * 24))
        }))
      };
      
      res.json({ 
        success: true, 
        stats 
      });
    } catch (error) {
      logger.error('Error getting referral stats:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  async checkQualifications(req, res) {
    try {
      const pendingReferrals = await Referral.find({ 
        status: { $ne: 'qualified' } 
      });
      
      const results = {
        total: pendingReferrals.length,
        qualified: 0,
        updated: 0,
        errors: 0
      };
      
      for (const referral of pendingReferrals) {
        try {
          if (referral.userType === 'website_owner') {
            // Count websites and categories for this user
            const [websiteCount, adCategoryCount] = await Promise.all([
              Website.countDocuments({ ownerId: referral.referredUserId }),
              AdCategory.countDocuments({ ownerId: referral.referredUserId })
            ]);
            
            // Update website details if not already recorded
            if (websiteCount > 0 && (!referral.websiteDetails || referral.websiteDetails.length === 0)) {
              const websites = await Website.find({ ownerId: referral.referredUserId }).lean();
              referral.websiteDetails = websites.map(site => ({
                websiteId: site._id.toString(),
                websiteName: site.websiteName,
                websiteLink: site.websiteLink,
                createdAt: site.createdAt
              }));
              referral.status = 'website_created';
              results.updated++;
            }
            
            // Update category details if not already recorded
            if (adCategoryCount > 0 && (!referral.categoryDetails || referral.categoryDetails.length === 0)) {
              const categories = await AdCategory.find({ ownerId: referral.referredUserId }).lean();
              referral.categoryDetails = categories.map(cat => ({
                categoryId: cat._id.toString(),
                categoryName: cat.categoryName,
                createdAt: cat.createdAt
              }));
              results.updated++;
            }
            
            // Check qualification criteria
            if (websiteCount >= 1 && adCategoryCount >= 1 && referral.status !== 'qualified') {
              referral.status = 'qualified';
              referral.qualifiedAt = new Date();
              referral.completionProgress = 100;
              
              // Update the referrer's qualified referral count
              await ReferralCode.updateOne(
                { userId: referral.referrerId },
                { 
                  $inc: { totalQualifiedReferrals: 1 },
                  $set: { lastUpdated: new Date() }
                }
              );
              
              results.qualified++;
            } else {
              // Update progress even if not fully qualified
              referral.completionProgress = calculateReferralProgress(referral);
            }
          } else if (referral.userType === 'advertiser') {
            // Check ad creation for advertisers
            const adsCount = await ImportAd.countDocuments({ userId: referral.referredUserId });
            
            if (adsCount >= 1 && referral.status !== 'qualified') {
              referral.status = 'qualified';
              referral.qualifiedAt = new Date();
              referral.completionProgress = 100;
              
              // Update the referrer's qualified referral count
              await ReferralCode.updateOne(
                { userId: referral.referrerId },
                { 
                  $inc: { totalQualifiedReferrals: 1 },
                  $set: { lastUpdated: new Date() }
                }
              );
              
              results.qualified++;
            }
          }
          
          referral.lastUpdated = new Date();
          await referral.save();
        } catch (innerError) {
          logger.error(`Error processing referral ${referral._id}:`, innerError);
          results.errors++;
        }
      }
      
      logger.info(`Qualification check completed: ${results.qualified} qualified, ${results.updated} updated, ${results.errors} errors`);
      
      res.json({ 
        success: true, 
        message: 'Qualification check completed',
        results
      });
    } catch (error) {
      logger.error('Error checking qualifications:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  },

  async debugReferral(req, res) {
    try {
      const { userId } = req.params;
      
      const [referralCodes, referrals, websites, categories] = await Promise.all([
        ReferralCode.find({}).lean(),
        Referral.find({}).lean(),
        userId ? Website.find({ ownerId: userId }).lean() : [],
        userId ? AdCategory.find({ ownerId: userId }).lean() : []
      ]);
      
      res.json({
        referralCodes,
        referrals,
        websites,
        categories
      });
    } catch (error) {
      logger.error('Error debugging referrals:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};

module.exports = referralController;