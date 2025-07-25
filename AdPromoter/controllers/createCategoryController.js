// createCategoryController.js
const mongoose = require('mongoose');
const AdCategory = require('../models/CreateCategoryModel');
const User = require('../../models/User');
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const Website = require('../models/CreateWebsiteModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel'); // Balance tracking model
const Payment = require('../../AdOwner/models/PaymentModel');
const PaymentTracker = require('../../AdOwner/models/PaymentTracker');
const axios = require('axios');

const TEST_CONFIG = {
  FLUTTERWAVE_BASE_URL: 'https://api.flutterwave.com/v3',
  FLW_TEST_SECRET_KEY: process.env.FLW_TEST_SECRET_KEY || 'FLWSECK_TEST-your-test-secret-key-here',
  CALLBACK_URL: process.env.TEST_CALLBACK_URL || "https://your-test-domain.com/api/accept/withdrawal-callback",
  
  // Test data for different payment methods
  TEST_MOBILE_NUMBERS: [
    '0700000001', // Always successful
    '0700000002', // Always fails
    '0700000003', // Pending then successful
  ],
  
  TEST_CARD_NUMBERS: [
    '4187427415564246', // Visa - Always successful
    '5531886652142950', // Mastercard - Always successful
    '4000000000000002', // Always fails
  ]
};

// Enhanced Withdrawal Model to support multiple payment methods
const enhancedWithdrawalSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  
  // Payment method type
  paymentMethod: { 
    type: String, 
    enum: ['mobile_money', 'bank_card', 'bank_transfer'],
    required: true
  },
  
  // Mobile Money fields
  phoneNumber: { type: String },
  
  // Card fields
  cardNumber: { type: String },
  cardHolderName: { type: String },
  expiryMonth: { type: String },
  expiryYear: { type: String },
  
  // Bank transfer fields
  bankCode: { type: String },
  accountNumber: { type: String },
  accountName: { type: String },
  
  // Common fields
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  transactionId: { type: String },
  reference: { type: String },
  failureReason: { type: String },
  testMode: { type: Boolean, default: false },
  completedAt: { type: Date },
}, { timestamps: true });

// Update the model export
const EnhancedWithdrawal = mongoose.models.EnhancedWithdrawal || 
  mongoose.model('EnhancedWithdrawal', enhancedWithdrawalSchema);

class EnhancedWithdrawalService {
  // Validate withdrawal input for different payment methods
  static validateWithdrawalInput(data) {
    const { amount, userId, paymentMethod } = data;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('Invalid amount. Must be a positive number.');
    }

    if (!userId) {
      throw new Error('User ID is required.');
    }

    if (!paymentMethod) {
      throw new Error('Payment method is required.');
    }

    // Method-specific validation
    switch (paymentMethod) {
      case 'mobile_money':
        if (!data.phoneNumber || !/^(07\d{8})$/.test(data.phoneNumber)) {
          throw new Error('Invalid phone number. Must start with 07 and be 10 digits.');
        }
        break;
        
      case 'bank_card':
        if (!data.cardNumber || !data.cardHolderName || !data.expiryMonth || !data.expiryYear) {
          throw new Error('Card details are incomplete. All fields are required.');
        }
        if (!/^\d{13,19}$/.test(data.cardNumber.replace(/\s/g, ''))) {
          throw new Error('Invalid card number format.');
        }
        break;
        
      case 'bank_transfer':
        if (!data.bankCode || !data.accountNumber || !data.accountName) {
          throw new Error('Bank details are incomplete. All fields are required.');
        }
        break;
        
      default:
        throw new Error('Unsupported payment method.');
    }
  }

  // Prepare payload for different payment methods
  static prepareTransferPayload(data) {
    const reference = `WITHDRAWAL-${data.userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const basePayload = {
      amount: data.amount,
      currency: data.currency || 'USD', // Default to USD for international
      reference,
      callback_url: TEST_CONFIG.CALLBACK_URL,
      meta: {
        test_mode: true,
        environment: 'sandbox',
        user_id: data.userId
      }
    };

    switch (data.paymentMethod) {
      case 'mobile_money':
        return {
          ...basePayload,
          account_bank: 'MPS', // Mobile Money Rwanda
          account_number: data.phoneNumber,
          currency: 'RWF',
          beneficiary_name: 'MoMo Transfer',
          debit_currency: 'RWF'
        };
        
      case 'bank_card':
        return {
          ...basePayload,
          type: 'card',
          card_number: data.cardNumber.replace(/\s/g, ''),
          card_holder_name: data.cardHolderName,
          expiry_month: data.expiryMonth,
          expiry_year: data.expiryYear,
          beneficiary_name: data.cardHolderName
        };
        
      case 'bank_transfer':
        return {
          ...basePayload,
          account_bank: data.bankCode,
          account_number: data.accountNumber,
          beneficiary_name: data.accountName,
          debit_currency: data.currency || 'USD'
        };
        
      default:
        throw new Error('Unsupported payment method for payload preparation.');
    }
  }

  // Get appropriate endpoint based on payment method
  static getTransferEndpoint(paymentMethod) {
    switch (paymentMethod) {
      case 'mobile_money':
        return '/transfers';
      case 'bank_card':
        return '/transfers'; // Flutterwave handles card transfers via same endpoint
      case 'bank_transfer':
        return '/transfers';
      default:
        return '/transfers';
    }
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

exports.checkWithdrawalEligibility = async (req, res) => {
  try {
    const { payment } = req.params;
    console.log('Received payment parameter:', payment);
    
    let paymentTracker;
    try {
      paymentTracker = await PaymentTracker.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(payment) ? new mongoose.Types.ObjectId(payment) : null },
          { paymentReference: payment }
        ]
      });
    } catch (findError) {
      console.error('Error finding payment tracker:', findError);
      throw findError;
    }

    if (!paymentTracker) {
      const paymentParts = payment.split('-');
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
          amount: 0,
          viewsRequired: 1000,
          currentViews: 0,
          status: 'pending',
          paymentReference: payment
        });

        await newPaymentTracker.save();
        paymentTracker = newPaymentTracker;
      } catch (createError) {
        return res.status(500).json({
          eligible: false,
          message: 'Error creating payment tracker',
          error: createError.message
        });
      }
    }

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
    } catch (populateError) {
      throw populateError;
    }

    const paymentData = populatedPayment.toObject();

    console.log('🧪 TEST MODE: Skipping restrictions for testing');
    return res.status(200).json({ 
      eligible: true,
      message: '🧪 TEST MODE: Eligible for withdrawal (restrictions bypassed)',
      payment: paymentData,
      test_mode: true
    });

  } catch (error) {
    console.error('Withdrawal eligibility check error:', error);
    return res.status(500).json({ 
      eligible: false,
      message: 'Error checking withdrawal eligibility',
      error: error.message
    });
  }
};

exports.initiateWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const withdrawalData = req.body;
    console.log('🧪 TEST MODE: Initiating withdrawal', withdrawalData);

    // STEP 1A: First check if we can access Flutterwave API at all
    console.log('🔍 Testing Flutterwave API access...');
    try {
      const testResponse = await axios.get('https://api.flutterwave.com/v3/banks/NG', {
        headers: {
          'Authorization': `Bearer ${TEST_CONFIG.FLW_TEST_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      console.log('✅ Flutterwave API is accessible');
    } catch (apiTestError) {
      console.log('❌ API Test Failed:', apiTestError.response?.data?.message || apiTestError.message);
      
      // If it's IP whitelist issue, return helpful response
      if (apiTestError.response?.data?.message?.includes('IP Whitelisting')) {
        await session.abortTransaction();
        return res.status(400).json({
          message: '🚨 IP Whitelist Issue Detected',
          error: 'Your server IP is not whitelisted in Flutterwave',
          solution: {
            step1: 'Go to https://dashboard.flutterwave.com',
            step2: 'Navigate to Settings > API Keys',
            step3: 'Update IP Whitelist with your current server IP',
            step4: 'Wait 5-10 minutes for changes to propagate',
            currentIP: 'Check your current IP using the diagnostic endpoint below'
          },
          test_mode: true
        });
      }
    }

    // Input validation (your existing code)
    try {
      EnhancedWithdrawalService.validateWithdrawalInput(withdrawalData);
    } catch (validationError) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: validationError.message,
        test_mode: true 
      });
    }

    // Check balance (your existing code)
    const balance = await WebOwnerBalance.findOne({ userId: withdrawalData.userId });
    if (!balance || balance.availableBalance < withdrawalData.amount) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Insufficient balance',
        currentBalance: balance?.availableBalance || 0,
        test_mode: true
      });
    }

    // Prepare transfer payload (your existing code)
    const transferPayload = EnhancedWithdrawalService.prepareTransferPayload(withdrawalData);
    const endpoint = EnhancedWithdrawalService.getTransferEndpoint(withdrawalData.paymentMethod);

    // STEP 1B: Enhanced Flutterwave request with better error handling
    try {
      console.log('🧪 Sending test transfer request to Flutterwave sandbox...');
      console.log('Payload:', JSON.stringify(transferPayload, null, 2));
      
      const response = await axios.post(
        `${TEST_CONFIG.FLUTTERWAVE_BASE_URL}${endpoint}`, 
        transferPayload, 
        {
          headers: { 
            Authorization: `Bearer ${TEST_CONFIG.FLW_TEST_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // Increased timeout
        }
      );

      console.log('🧪 Flutterwave test response:', response.data);

      // Continue with your existing withdrawal logic...
      const withdrawal = new EnhancedWithdrawal({
        userId: withdrawalData.userId,
        amount: withdrawalData.amount,
        paymentMethod: withdrawalData.paymentMethod,
        
        // Payment method specific fields
        ...(withdrawalData.paymentMethod === 'mobile_money' && {
          phoneNumber: withdrawalData.phoneNumber
        }),
        ...(withdrawalData.paymentMethod === 'bank_card' && {
          cardNumber: `****-****-****-${withdrawalData.cardNumber.slice(-4)}`,
          cardHolderName: withdrawalData.cardHolderName,
          expiryMonth: withdrawalData.expiryMonth,
          expiryYear: withdrawalData.expiryYear
        }),
        ...(withdrawalData.paymentMethod === 'bank_transfer' && {
          bankCode: withdrawalData.bankCode,
          accountNumber: withdrawalData.accountNumber,
          accountName: withdrawalData.accountName
        }),
        
        status: response.data.status === 'success' ? 'processing' : 'failed',
        transactionId: response.data.data?.id,
        reference: transferPayload.reference,
        testMode: true
      });

      await withdrawal.save({ session });

      if (response.data.status === 'success') {
        // Update user's available balance
        await WebOwnerBalance.findOneAndUpdate(
          { userId: withdrawalData.userId },
          { $inc: { availableBalance: -withdrawalData.amount } },
          { session }
        );

        // Update payment tracker status if provided
        if (withdrawalData.paymentId) {
          await PaymentTracker.findByIdAndUpdate(
            withdrawalData.paymentId,
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
      
      // Enhanced error response for IP issues
      if (transferError.response?.data?.message?.includes('IP Whitelisting')) {
        return res.status(400).json({ 
          message: '🚨 IP Whitelist Error',
          error: 'Your server IP is not whitelisted in Flutterwave dashboard',
          action_required: 'Update your Flutterwave IP whitelist',
          steps: [
            '1. Login to https://dashboard.flutterwave.com',
            '2. Go to Settings > API Keys',
            '3. Update IP Whitelist section',
            '4. Add your current server IP',
            '5. Wait 5-10 minutes for propagation'
          ],
          test_mode: true
        });
      }
      
      return res.status(500).json({ 
        message: '🧪 TEST: Error processing transfer',
        error: transferError.response?.data || transferError.message,
        test_mode: true
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
    const withdrawal = await EnhancedWithdrawal.findOne({ 
      $or: [
        { transactionId: data.id },
        { reference: data.tx_ref }
      ]
    });

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

exports.checkIPAndFlutterwaveAccess = async (req, res) => {
  try {
    console.log('🔍 Running comprehensive diagnostic...');
    
    // Get current IP
    let currentIP = 'unknown';
    try {
      const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      currentIP = ipResponse.data.ip;
    } catch (ipError) {
      console.log('Could not determine IP:', ipError.message);
    }
    
    // Test Flutterwave API access
    let flutterwaveAccess = false;
    let flutterwaveError = '';
    
    try {
      await axios.get('https://api.flutterwave.com/v3/banks/NG', {
        headers: {
          'Authorization': `Bearer ${TEST_CONFIG.FLW_TEST_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      flutterwaveAccess = true;
    } catch (fwError) {
      flutterwaveError = fwError.response?.data?.message || fwError.message;
    }
    
    // Generate response
    const diagnostic = {
      server_ip: currentIP,
      flutterwave_whitelisted_ip: '102.22.140.7',
      ip_match: currentIP === '102.22.140.7',
      flutterwave_api_accessible: flutterwaveAccess,
      flutterwave_error: flutterwaveError,
      
      status: flutterwaveAccess ? 'READY' : 'NEEDS_ATTENTION',
      
      next_steps: flutterwaveAccess ? 
        ['✅ Everything looks good! Withdrawals should work.'] :
        [
          '🚨 Action required: IP whitelist issue detected',
          '1. Go to https://dashboard.flutterwave.com',
          '2. Navigate to Settings > API Keys',
          '3. Find "IP Whitelisting" section',
          `4. Add your current IP: ${currentIP}`,
          '5. Save changes and wait 5-10 minutes',
          '6. Test this endpoint again'
        ]
    };
    
    res.json(diagnostic);
    
  } catch (error) {
    res.status(500).json({
      message: 'Diagnostic failed',
      error: error.message
    });
  }
};

exports.requestManualWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const withdrawalData = req.body;
    
    // Validate input
    EnhancedWithdrawalService.validateWithdrawalInput(withdrawalData);
    
    // Check balance
    const balance = await WebOwnerBalance.findOne({ userId: withdrawalData.userId });
    if (!balance || balance.availableBalance < withdrawalData.amount) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Insufficient balance',
        currentBalance: balance?.availableBalance || 0
      });
    }
    
    // Create withdrawal record for manual processing
    const withdrawal = new EnhancedWithdrawal({
      userId: withdrawalData.userId,
      amount: withdrawalData.amount,
      paymentMethod: withdrawalData.paymentMethod,
      
      // Store payment details
      ...(withdrawalData.paymentMethod === 'mobile_money' && {
        phoneNumber: withdrawalData.phoneNumber
      }),
      ...(withdrawalData.paymentMethod === 'bank_card' && {
        cardNumber: `****-****-****-${withdrawalData.cardNumber.slice(-4)}`,
        cardHolderName: withdrawalData.cardHolderName,
        expiryMonth: withdrawalData.expiryMonth,
        expiryYear: withdrawalData.expiryYear
      }),
      ...(withdrawalData.paymentMethod === 'bank_transfer' && {
        bankCode: withdrawalData.bankCode,
        accountNumber: withdrawalData.accountNumber,
        accountName: withdrawalData.accountName
      }),
      
      status: 'pending', // Will be processed manually
      reference: `MANUAL-${withdrawalData.userId}-${Date.now()}`,
      testMode: true
    });
    
    await withdrawal.save({ session });
    
    // Reserve the amount (don't deduct yet, will deduct when processed)
    await WebOwnerBalance.findOneAndUpdate(
      { userId: withdrawalData.userId },
      { $inc: { availableBalance: -withdrawalData.amount } },
      { session }
    );
    
    await session.commitTransaction();
    
    // Log for manual processing
    console.log('📋 MANUAL WITHDRAWAL REQUEST:');
    console.log('================================');
    console.log(`Reference: ${withdrawal.reference}`);
    console.log(`User ID: ${withdrawalData.userId}`);
    console.log(`Amount: ${withdrawalData.amount}`);
    console.log(`Method: ${withdrawalData.paymentMethod}`);
    console.log(`Details:`, withdrawalData);
    console.log('Process this manually in Flutterwave dashboard');
    
    res.json({
      message: 'Withdrawal request received - will be processed manually',
      reference: withdrawal.reference,
      estimated_processing_time: '1-2 business days',
      status: 'pending_manual_processing'
    });
    
  } catch (error) {
    await session.abortTransaction();
    console.error('Manual withdrawal error:', error);
    res.status(500).json({ 
      message: 'Error processing withdrawal request',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

exports.getManualWithdrawals = async (req, res) => {
  try {
    const { status = 'pending', limit = 50, page = 1 } = req.query;
    
    const manualWithdrawals = await EnhancedWithdrawal.find({
      status: status,
      // Optional: filter by recent requests only
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));
    
    console.log(`📋 Found ${manualWithdrawals.length} manual withdrawal requests`);
    
    res.json({
      message: 'Manual withdrawal requests retrieved',
      withdrawals: manualWithdrawals,
      count: manualWithdrawals.length,
      page: parseInt(page),
      status: status
    });
    
  } catch (error) {
    console.error('Error fetching manual withdrawals:', error);
    res.status(500).json({
      message: 'Error fetching manual withdrawals',
      error: error.message
    });
  }
};