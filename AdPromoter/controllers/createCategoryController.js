// createCategoryController.js
const mongoose = require('mongoose');
const AdCategory = require('../models/CreateCategoryModel');
const User = require('../../models/User');
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const Website = require('../models/CreateWebsiteModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel'); // Balance tracking model
const Payment = require('../../AdOwner/models/PaymentModel');
const PaymentTracker = require('../../AdOwner/models/PaymentTracker');
const Withdrawal = require('../models/WithdrawalModel');

const TEST_CONFIG = {
  // Flutterwave Test API Base URL
  FLUTTERWAVE_BASE_URL: 'https://api.flutterwave.com/v3',
  
  // Test Secret Key (replace with your actual test key)
  FLW_TEST_SECRET_KEY: process.env.FLW_TEST_SECRET_KEY || 'FLWSECK_TEST-your-test-secret-key-here',
  
  // Test callback URL
  CALLBACK_URL: process.env.TEST_CALLBACK_URL || "https://your-test-domain.com/api/accept/withdrawal-callback",
  
  // Test phone numbers that work in sandbox
  TEST_PHONE_NUMBERS: [
    '0700000001', // Always successful
    '0700000002', // Always fails
    '0700000003', // Pending then successful
  ]
};

class WithdrawalService {
  // Validate withdrawal input parameters
  static validateWithdrawalInput(amount, phoneNumber, userId) {
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('Invalid amount. Must be a positive number.');
    }

    if (!phoneNumber || !/^(07\d{8})$/.test(phoneNumber)) {
      throw new Error('Invalid phone number. Must start with 07 and be 10 digits.');
    }

    if (!userId) {
      throw new Error('User ID is required.');
    }
  }

  // Prepare Flutterwave transfer payload for test mode
  static prepareTransferPayload(phoneNumber, amount, userId) {
    const reference = `TEST-WITHDRAWAL-${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return {
      account_bank: 'MPS', // Mobile Money Rwanda
      account_number: phoneNumber,
      amount,
      currency: 'RWF',
      beneficiary_name: 'Test MoMo Transfer',
      reference,
      callback_url: TEST_CONFIG.CALLBACK_URL,
      debit_currency: 'RWF',
      // Test mode specific fields
      meta: {
        test_mode: true,
        environment: 'sandbox'
      }
    };
  }

  // Check if phone number is a test number
  static isTestPhoneNumber(phoneNumber) {
    return TEST_CONFIG.TEST_PHONE_NUMBERS.includes(phoneNumber);
  }
}

const generateScriptTag = (categoryId) => {
  return {
    script: `<script src="http://localhost:5000/api/ads/script/${categoryId}"></script>`
  };
};

exports.createCategory = async (req, res) => {
  try {
    // Add debugging to see what's in req.user
    console.log('req.user:', req.user);
    console.log('req.headers:', req.headers);
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required. Please login.' });
    }

    const { 
      websiteId,
      categoryName,
      description,
      price,
      customAttributes,
      spaceType,
      userCount,
      instructions,
      visitorRange,
      tier
    } = req.body;

    // Get userId from req.user with fallback options
    const userId = req.user.userId || req.user.id || req.user._id;

    if (!userId) {
      console.error('No userId found in req.user:', req.user);
      return res.status(401).json({ message: 'User ID not found in authentication data' });
    }

    // Try to find user by ID
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found in database with ID:', userId);
      return res.status(401).json({ message: 'User not found in database' });
    }

    const ownerId = user._id.toString();
    const webOwnerEmail = user.email;

    // Validation
    if (!websiteId || !categoryName || !price || !spaceType || !visitorRange || !tier) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['websiteId', 'categoryName', 'price', 'spaceType', 'visitorRange', 'tier'],
        received: { websiteId, categoryName, price, spaceType, visitorRange, tier }
      });
    }

    // Create new category
    const newCategory = new AdCategory({
      ownerId,
      websiteId,
      categoryName,
      description,
      price,
      spaceType,
      userCount: userCount || 0,
      instructions,
      customAttributes: customAttributes || {},
      webOwnerEmail,
      selectedAds: [],
      visitorRange,
      tier
    });

    const savedCategory = await newCategory.save();
    const { script } = generateScriptTag(savedCategory._id.toString());

    // Update with API codes
    savedCategory.apiCodes = {
      HTML: script,
      JavaScript: `const script = document.createElement('script');\nscript.src = "http://localhost:5000/api/ads/script/${savedCategory._id}";\ndocument.body.appendChild(script);`,
      PHP: `<?php echo '${script}'; ?>`,
      Python: `print('${script}')`
    };

    const finalCategory = await savedCategory.save();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: finalCategory
    });
    
  } catch (error) {
    console.error('Error creating category:', error);
    
    // Handle specific mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Category with this name already exists for this website' 
      });
    }

    res.status(500).json({ 
      message: 'Failed to create category', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

exports.resetUserCount = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { newUserCount } = req.body;

    // Validate input
    if (!newUserCount || newUserCount < 0) {
      return res.status(400).json({ 
        error: 'Invalid Input', 
        message: 'User count must be a non-negative number' 
      });
    }

    // Find the category
    const category = await AdCategory.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Category not found' 
      });
    }

    // Count current users who have selected this category
    const currentUserCount = await ImportAd.countDocuments({
      'websiteSelections.categories': categoryId,
      'websiteSelections.approved': true
    });

    // Ensure new user count is not less than current users
    if (newUserCount < currentUserCount) {
      return res.status(400).json({ 
        error: 'Invalid Reset', 
        message: 'New user count cannot be less than current approved users' 
      });
    }

    // Update the category with new user count
    category.userCount = newUserCount;
    await category.save();

    res.status(200).json({
      message: 'User count reset successfully',
      category
    });
  } catch (error) {
    console.error('Error resetting user count:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};

exports.deleteCategory = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { categoryId } = req.params;
    const { ownerId } = req.body;

    // Find the category
    const category = await AdCategory.findById(categoryId);

    // Check if category exists
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Verify the owner
    if (category.ownerId !== ownerId) {
      return res.status(403).json({ message: 'Unauthorized to delete this category' });
    }

    // Check for any ads with this category confirmed or approved
    const existingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          'categories': categoryId,
          $or: [
            { 'confirmed': true },
            { 'approved': true }
          ]
        }
      }
    });

    // If any ads exist with this category confirmed or approved, prevent deletion
    if (existingAds.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category with active or confirmed ads',
        affectedAds: existingAds.map(ad => ad._id)
      });
    }

    // Start transaction
    session.startTransaction();

    try {
      // Delete the category
      await AdCategory.findByIdAndDelete(categoryId).session(session);

      // Remove references to this category from all ImportAd documents
      await ImportAd.updateMany(
        { 'websiteSelections.categories': categoryId },
        { 
          $pull: { 
            'websiteSelections.$.categories': categoryId 
          } 
        }
      ).session(session);

      // Commit the transaction
      await session.commitTransaction();

      res.status(200).json({ 
        message: 'Category deleted successfully' 
      });

    } catch (transactionError) {
      // Abort the transaction on error
      await session.abortTransaction();
      throw transactionError;
    }

  } catch (error) {
    console.error('Error deleting category:', error);
    
    // Ensure session is ended even if there's an error
    if (session) {
      await session.endSession();
    }

    res.status(500).json({ 
      message: 'Failed to delete category', 
      error: error.message 
    });
  } finally {
    // Ensure session is always ended
    if (session) {
      await session.endSession();
    }
  }
};

exports.getCategories = async (req, res) => {
  const { ownerId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ ownerId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ ownerId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
  }
};

exports.getCategoriesByWebsiteForAdvertisers = async (req, res) => {
  const { websiteId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    // Validate websiteId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(websiteId)) {
      return res.status(400).json({ message: 'Invalid website ID' });
    }

    const websiteObjectId = new mongoose.Types.ObjectId(websiteId);

    const categories = await AdCategory.aggregate([
      { $match: { websiteId: websiteObjectId } },
      {
        $lookup: {
          from: 'importads', 
          let: { categoryId: '$_id' },
          pipeline: [
            { $unwind: { path: '$websiteSelections', preserveNullAndEmptyArrays: true } },
            { $match: { 
              $expr: { 
                $and: [
                  { $eq: ['$websiteSelections.websiteId', websiteObjectId] },
                  { $in: ['$$categoryId', '$websiteSelections.categories'] }
                ]
              }
            }},
            { $count: 'categoryCount' }
          ],
          as: 'currentUserCount'
        }
      },
      {
        $addFields: {
          currentUserCount: { 
            $ifNull: [{ $arrayElemAt: ['$currentUserCount.categoryCount', 0] }, 0] 
          },
          isFullyBooked: { 
            $gte: [
              { $ifNull: [{ $arrayElemAt: ['$currentUserCount.categoryCount', 0] }, 0] }, 
              '$userCount' 
            ] 
          }
        }
      }
    ])
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const count = await AdCategory.countDocuments({ websiteId: websiteObjectId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error in getCategoriesByWebsiteForAdvertisers:', error);
    res.status(500).json({ 
      message: 'Failed to fetch categories', 
      error: error.message 
    });
  }
};

exports.getCategoriesByWebsite = async (req, res) => {
  const { websiteId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ websiteId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ websiteId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
  }
};

exports.getCategoryById = async (req, res) => {
  const { categoryId } = req.params;

  try {
    const category = await AdCategory.findById(categoryId);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch category', error });
  }
};

exports.updateCategoryLanguage = async (req, res) => {
  const { categoryId } = req.params;
  const { defaultLanguage } = req.body;
  
  try {
    const updatedCategory = await AdCategory.findByIdAndUpdate(
      categoryId,
      { defaultLanguage },
      { new: true, runValidators: true }
    );
    
    if (!updatedCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.status(200).json(updatedCategory);
  } catch (error) {
    console.error('Error updating category language:', error);
    res.status(500).json({ message: 'Error updating category language', error: error.message });
  }
};

exports.getPendingAds = async (req, res) => {
  try {
    const { ownerId } = req.params;
    console.log('🔍 Debug: ownerId received:', ownerId);
    
    // First verify the requesting user owns these websites
    const websites = await Website.find({ 
      ownerId: ownerId 
    });
    
    console.log('🔍 Debug: websites found:', websites.length);
    console.log('🔍 Debug: website details:', websites.map(w => ({ id: w._id, name: w.websiteName })));
    
    if (!websites.length) {
      console.log('❌ Debug: No websites found for owner:', ownerId);
      return res.status(403).json({ 
        message: 'No websites found for this owner' 
      });
    }

    const websiteIds = websites.map(website => website._id);
    console.log('🔍 Debug: websiteIds array:', websiteIds);

    // Check all ads first (for debugging)
    const allAds = await ImportAd.find({});
    console.log('🔍 Debug: Total ads in database:', allAds.length);
    console.log('🔍 Debug: All ads websiteSelections:', allAds.map(ad => ({
      id: ad._id,
      businessName: ad.businessName,
      websiteSelections: ad.websiteSelections.map(ws => ({
        websiteId: ws.websiteId,
        approved: ws.approved
      }))
    })));

    // Add owner verification to the query
    const pendingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          websiteId: { $in: websiteIds },
          approved: false
        }
      }
    })
    .populate({
      path: 'websiteSelections.websiteId',
      match: { ownerId: ownerId } // Only populate websites owned by the requesting user
    })
    .populate('websiteSelections.categories');

    console.log('🔍 Debug: Raw pending ads found:', pendingAds.length);
    console.log('🔍 Debug: Pending ads before transformation:', pendingAds.map(ad => ({
      id: ad._id,
      businessName: ad.businessName,
      websiteSelections: ad.websiteSelections.map(ws => ({
        websiteId: ws.websiteId,
        approved: ws.approved,
        populated: ws.websiteId !== null
      }))
    })));

    // Filter out any selections where websiteId is null (means user doesn't own it)
    const transformedAds = pendingAds
      .map(ad => {
        // Only include website selections the user owns
        const validSelections = ad.websiteSelections.filter(
          selection => selection.websiteId !== null
        );

        console.log('🔍 Debug: Valid selections for ad', ad.businessName, ':', validSelections.length);

        // If no valid selections remain, return null
        if (validSelections.length === 0) return null;

        return {
          _id: ad._id,
          businessName: ad.businessName,
          businessLink: ad.businessLink,
          businessLocation: ad.businessLocation,
          adDescription: ad.adDescription,
          imageUrl: ad.imageUrl,
          videoUrl: ad.videoUrl,
          pdfUrl: ad.pdfUrl,
          websiteDetails: validSelections.map(selection => ({
            website: selection.websiteId,
            categories: selection.categories,
            approved: selection.approved
          }))
        };
      })
      .filter(ad => ad !== null); // Remove any null entries

    console.log('🔍 Debug: Final transformed ads:', transformedAds.length);
    console.log('🔍 Debug: Sending response:', JSON.stringify(transformedAds, null, 2));

    res.status(200).json(transformedAds);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({ message: 'Error fetching pending ads', error: error.message });
  }
};

exports.approveAdForWebsite = async (req, res) => {
  try {
    const { adId, websiteId } = req.params;

    // First verify the ad and website exist
    const ad = await ImportAd.findById(adId);
    const website = await Website.findById(websiteId);

    if (!ad || !website) {
      return res.status(404).json({ 
        message: `${!ad ? 'Ad' : 'Website'} not found` 
      });
    }

    // Find the website selection that matches our websiteId
    const websiteSelection = ad.websiteSelections.find(
      ws => ws.websiteId.toString() === websiteId
    );

    if (!websiteSelection) {
      return res.status(404).json({ 
        message: 'This ad is not associated with the specified website' 
      });
    }

    // Update the approval status
    const updatedAd = await ImportAd.findOneAndUpdate(
      { 
        _id: adId,
        'websiteSelections.websiteId': websiteId 
      },
      {
        $set: {
          'websiteSelections.$.approved': true,
          'websiteSelections.$.approvedAt': new Date()
        }
      },
      { 
        new: true,
        runValidators: true 
      }
    ).populate('websiteSelections.websiteId websiteSelections.categories');

    if (!updatedAd) {
      return res.status(500).json({ 
        message: 'Error updating ad approval status' 
      });
    }

    // Check if all websites are now approved
    const allWebsitesApproved = updatedAd.websiteSelections.every(ws => ws.approved);

    // If all websites are approved, update the main confirmed status
    if (allWebsitesApproved && !updatedAd.confirmed) {
      updatedAd.confirmed = true;
      await updatedAd.save();
    }

    res.status(200).json({
      message: 'Ad approved successfully',
      ad: updatedAd,
      allApproved: allWebsitesApproved
    });

  } catch (error) {
    console.error('Ad approval error:', error);
    res.status(500).json({ 
      message: 'Error processing ad approval', 
      error: error.message 
    });
  }
};

exports.checkWithdrawalEligibility = async (req, res) => {
  try {
    const { payment } = req.params;
    console.log('Received payment parameter:', payment);
    
    // First try to find the PaymentTracker by the payment reference
    let paymentTracker;
    try {
      paymentTracker = await PaymentTracker.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(payment) ? new mongoose.Types.ObjectId(payment) : null },
          { paymentReference: payment }
        ]
      });
      console.log('Existing payment tracker:', paymentTracker);
    } catch (findError) {
      console.error('Error finding payment tracker:', findError);
      throw findError;
    }

    if (!paymentTracker) {
      console.log('No existing payment tracker found, attempting to create new one');
      // If no PaymentTracker exists, create one
      const paymentParts = payment.split('-');
      console.log('Payment reference parts:', paymentParts);

      if (paymentParts.length < 3) {
        return res.status(400).json({
          eligible: false,
          message: 'Invalid payment reference format',
          details: `Expected format: USER-AD-CATEGORY, got: ${payment}`
        });
      }

      const userId = paymentParts[1];
      const adId = paymentParts[2];
      const categoryId = paymentParts[3];

      try {
        const newPaymentTracker = new PaymentTracker({
          userId,
          adId: adId,
          categoryId: categoryId,
          paymentDate: new Date(),
          amount: 0, // You'll need to set this from your payment data
          viewsRequired: 1000, // Set your default required views
          currentViews: 0,
          status: 'pending',
          paymentReference: payment
        });

        console.log('Attempting to save new payment tracker:', newPaymentTracker);
        await newPaymentTracker.save();
        paymentTracker = newPaymentTracker;
        console.log('Successfully saved new payment tracker');
      } catch (createError) {
        console.error('Error creating payment tracker:', createError);
        return res.status(500).json({
          eligible: false,
          message: 'Error creating payment tracker',
          error: createError.message
        });
      }
    }

    console.log('Attempting to populate payment data');
    // If found, then populate the references
    let populatedPayment;
    try {
      populatedPayment = await PaymentTracker.findById(paymentTracker._id)
        .populate({
          path: 'adId',
          select: 'businessName businessLocation businessLink'
        })
        .populate({
          path: 'categoryId',
          select: 'categoryName visitorRange'
        });

      console.log('Populated payment data:', populatedPayment);
    } catch (populateError) {
      console.error('Error populating payment data:', populateError);
      throw populateError;
    }

    const paymentData = populatedPayment.toObject();

    const lastRelevantDate = paymentData.lastWithdrawalDate || paymentData.paymentDate;
    const daysSinceLastWithdrawal = Math.floor(
      (new Date() - new Date(lastRelevantDate)) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastWithdrawal < 30) {
      const nextEligibleDate = new Date(lastRelevantDate);
      nextEligibleDate.setDate(nextEligibleDate.getDate() + 30);
      
      return res.status(200).json({
        eligible: false,
        message: `Next withdrawal available from ${nextEligibleDate.toLocaleDateString()}`,
        nextEligibleDate,
        payment: paymentData
      });
    }

    if (paymentData.currentViews < paymentData.viewsRequired) {
      return res.status(200).json({
        eligible: false,
        message: `Required views not met (${paymentData.currentViews}/${paymentData.viewsRequired} views)`,
        payment: paymentData
      });
    }

    return res.status(200).json({ 
      eligible: true,
      message: 'Eligible for withdrawal',
      payment: paymentData
    });

  } catch (error) {
    console.error('Withdrawal eligibility check error:', error);
    return res.status(500).json({ 
      eligible: false,
      message: 'Error checking withdrawal eligibility',
      error: error.message,
      stack: error.stack
    });
  }
};

exports.getWebOwnerBalance = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const balance = await WebOwnerBalance.findOne({ userId });

    if (!balance) {
      return res.status(404).json({ message: 'No balance found for this user' });
    }

    res.status(200).json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ 
      message: 'Error fetching balance', 
      error: error.message 
    });
  }
};

exports.getDetailedEarnings = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find all successful payments for this web owner
    const payments = await Payment.aggregate([
      {
        $match: {
          webOwnerId: userId,
          status: 'successful',
          withdrawn: false
        }
      },
      {
        // Join with ImportAd to get business details
        $lookup: {
          from: 'importads',
          localField: 'adId',
          foreignField: '_id',
          as: 'adDetails'
        }
      },
      {
        $unwind: '$adDetails'
      },
      {
        // Format the output
        $project: {
          _id: 1,
          amount: 1,
          currency: 1,
          paymentDate: '$createdAt',
          businessName: '$adDetails.businessName',
          businessLocation: '$adDetails.businessLocation',
          businessLink: '$adDetails.businessLink',
          advertiserEmail: '$adDetails.adOwnerEmail',
          paymentReference: '$tx_ref'
        }
      },
      {
        // Sort by payment date, most recent first
        $sort: { paymentDate: -1 }
      }
    ]);

    // Get the total balance
    const balanceRecord = await WebOwnerBalance.findOne({ userId });

    // Group payments by month
    const groupedPayments = payments.reduce((acc, payment) => {
      const monthYear = new Date(payment.paymentDate).toLocaleString('en-US', {
        month: 'long',
        year: 'numeric'
      });

      if (!acc[monthYear]) {
        acc[monthYear] = {
          totalAmount: 0,
          payments: []
        };
      }

      acc[monthYear].payments.push(payment);
      acc[monthYear].totalAmount += payment.amount;

      return acc;
    }, {});

    const response = {
      totalBalance: {
        totalEarnings: balanceRecord?.totalEarnings || 0,
        availableBalance: balanceRecord?.availableBalance || 0
      },
      monthlyEarnings: Object.entries(groupedPayments).map(([month, data]) => ({
        month,
        totalAmount: data.totalAmount,
        payments: data.payments
      }))
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching detailed earnings:', error);
    res.status(500).json({
      message: 'Error fetching detailed earnings',
      error: error.message
    });
  }
};

exports.initiateWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount, phoneNumber, paymentId } = req.body;

    console.log('🧪 TEST MODE: Initiating withdrawal', { userId, amount, phoneNumber });

    // Input validation
    try {
      WithdrawalService.validateWithdrawalInput(amount, phoneNumber, userId);
    } catch (validationError) {
      return res.status(400).json({ 
        message: validationError.message,
        test_mode: true 
      });
    }

    // Test mode warning for non-test phone numbers
    if (!WithdrawalService.isTestPhoneNumber(phoneNumber)) {
      console.warn('⚠️  Using non-test phone number in test mode. Use test numbers for guaranteed results:', TEST_CONFIG.TEST_PHONE_NUMBERS);
    }

    // Check if user has sufficient balance
    const balance = await WebOwnerBalance.findOne({ userId });
    if (!balance || balance.availableBalance < amount) {
      return res.status(400).json({ 
        message: 'Insufficient balance',
        currentBalance: balance?.availableBalance || 0,
        test_mode: true
      });
    }

    // Prepare transfer payload
    const transferPayload = WithdrawalService.prepareTransferPayload(phoneNumber, amount, userId);

    try {
      console.log('🧪 Sending test transfer request to Flutterwave sandbox...');
      
      // Initiate transfer via Flutterwave TEST API
      const response = await axios.post(
        `${TEST_CONFIG.FLUTTERWAVE_BASE_URL}/transfers`, 
        transferPayload, 
        {
          headers: { 
            Authorization: `Bearer ${TEST_CONFIG.FLW_TEST_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      console.log('🧪 Flutterwave test response:', response.data);

      // Create withdrawal record
      const withdrawal = new Withdrawal({
        userId,
        amount,
        phoneNumber,
        status: response.data.status === 'success' ? 'processing' : 'failed',
        transactionId: response.data.data?.id,
        testMode: true, // Flag for test transactions
        reference: transferPayload.reference
      });
      await withdrawal.save({ session });

      if (response.data.status === 'success') {
        // Update user's available balance
        await WebOwnerBalance.findOneAndUpdate(
          { userId },
          { $inc: { availableBalance: -amount } },
          { session }
        );

        // Update payment tracker status if provided
        if (paymentId) {
          await PaymentTracker.findByIdAndUpdate(
            paymentId,
            {
              lastWithdrawalDate: new Date(),
              status: 'withdrawn'
            },
            { session }
          );
        }

        await session.commitTransaction();
        
        return res.status(200).json({
          message: '🧪 TEST: Withdrawal initiated successfully',
          reference: transferPayload.reference,
          withdrawal,
          test_mode: true,
          flutterwave_response: response.data
        });
      } else {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: '🧪 TEST: Failed to initiate transfer',
          error: response.data,
          test_mode: true
        });
      }
    } catch (transferError) {
      await session.abortTransaction();
      console.error('🧪 TEST: Transfer error:', transferError.response?.data || transferError.message);
      
      return res.status(500).json({ 
        message: '🧪 TEST: Error processing transfer',
        error: transferError.response?.data || transferError.message,
        test_mode: true,
        helpful_info: {
          test_phone_numbers: TEST_CONFIG.TEST_PHONE_NUMBERS,
          note: "Use test phone numbers for predictable results in sandbox mode"
        }
      });
    }
  } catch (error) {
    await session.abortTransaction();
    console.error('🧪 TEST: Withdrawal error:', error);
    res.status(500).json({ 
      message: '🧪 TEST: Error processing withdrawal',
      error: error.message,
      test_mode: true
    });
  } finally {
    session.endSession();
  }
};

exports.withdrawalCallback = async (req, res) => {
  console.log('🧪 TEST: Withdrawal callback received:', req.body);
  
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { data } = req.body;
    const withdrawal = await Withdrawal.findOne({ transactionId: data.id });

    if (!withdrawal) {
      console.error('🧪 TEST: Withdrawal not found for transaction:', data.id);
      return res.status(404).json({ 
        message: 'Withdrawal not found',
        test_mode: true 
      });
    }

    console.log('🧪 TEST: Processing callback for withdrawal:', withdrawal._id);

    if (data.status === 'successful' || data.status === 'SUCCESSFUL') {
      withdrawal.status = 'completed';
      withdrawal.completedAt = new Date();
      console.log('🧪 TEST: Withdrawal completed successfully');
    } else {
      withdrawal.status = 'failed';
      withdrawal.failureReason = data.complete_message || 'Transfer failed';
      
      // Refund the amount back to available balance
      await WebOwnerBalance.findOneAndUpdate(
        { userId: withdrawal.userId },
        { $inc: { availableBalance: withdrawal.amount } },
        { session }
      );
      
      console.log('🧪 TEST: Withdrawal failed, amount refunded');
    }

    await withdrawal.save({ session });
    await session.commitTransaction();
    
    res.status(200).json({ 
      message: '🧪 TEST: Callback processed successfully',
      test_mode: true,
      withdrawal_status: withdrawal.status
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('🧪 TEST: Withdrawal callback error:', error);
    res.status(500).json({ 
      message: '🧪 TEST: Error processing callback',
      error: error.message,
      test_mode: true
    });
  } finally {
    session.endSession();
  }
};