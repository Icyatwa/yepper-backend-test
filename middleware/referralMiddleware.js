// middleware/referralMiddleware.js
const referralController = require('../controllers/referralController');

const trackWebsiteCreation = async (req, res, next) => {
  const originalJson = res.json;
  
  // Override the json method to intercept the response
  res.json = function(data) {
    const originalData = data;
    
    // Only process if website creation was successful
    if (data && data._id && req.body.ownerId) {
      // Update referral status asynchronously
      referralController.updateWebsiteCreation(
        req.body.ownerId, 
        data._id.toString(),
        data.websiteName,
        data.websiteLink
      ).catch(err => {
        console.error('Error in trackWebsiteCreation middleware:', err);
      });
    }
    
    // Restore original json method and call it
    res.json = originalJson;
    return res.json(originalData);
  };
  
  next();
};

const trackCategoryCreation = async (req, res, next) => {
  const originalJson = res.json;
  
  // Override the json method to intercept the response
  res.json = function(data) {
    const originalData = data;
    
    // Only process if category creation was successful
    if (data && data._id && req.body.ownerId) {
      // Update referral status asynchronously
      referralController.updateCategoryCreation(
        req.body.ownerId,
        data._id.toString(),
        data.categoryName
      ).catch(err => {
        console.error('Error in trackCategoryCreation middleware:', err);
      });
    }
    
    // Restore original json method and call it
    res.json = originalJson;
    return res.json(originalData);
  };
  
  next();
};

module.exports = {
  trackWebsiteCreation,
  trackCategoryCreation
};