// WebAdvertiseController.js
const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const bucket = require('../../config/storage');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const User = require('../../models/User');
const WebOwnerBalance = require('../../AdPromoter/models/WebOwnerBalanceModel');
const sendEmailNotification = require('../../controllers/emailService');
const Payment = require('../models/PaymentModel');
const PaymentTracker = require('../models/PaymentTracker');

const TEST_CONFIG = {
  FLUTTERWAVE_BASE_URL: 'https://api.flutterwave.com/v3',
  FLW_TEST_SECRET_KEY: process.env.FLW_TEST_SECRET_KEY || 'FLWSECK_TEST-9504b813dd9d045d78c6b9d42302bd5a-X',
  FLW_TEST_PUBLIC_KEY: process.env.FLW_TEST_PUBLIC_KEY || 'FLWPUBK_TEST-fcfc9f220a306b8ff7924aa9042cf2ec-X',
  REDIRECT_URL: process.env.TEST_REDIRECT_URL || 'http://localhost:5000/api/web-advertise/callback',
  TEST_CUSTOMER: {
    email: 'test@flutterwave.com',
    phone_number: '+2348012345678',
    name: 'Test Customer'
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|mp4|avi|mov|mkv|webm|pdf/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type.'));
  },
});

exports.createImportAd = [upload.single('file'), async (req, res) => {
  try {
    // Early validation of authentication
    if (!req.user) {
      console.error('Authentication failed: req.user is undefined');
      return res.status(401).json({ 
        error: 'Authentication Failed',
        message: 'User authentication is required' 
      });
    }

    console.log('req.user:', req.user); // Debug log

    const {
      adOwnerEmail,
      businessName,
      businessLink,
      businessLocation,
      adDescription,
      selectedWebsites,
      selectedCategories,
    } = req.body;

    // Validate required fields
    if (!selectedWebsites || !selectedCategories) {
      return res.status(400).json({
        error: 'Missing Required Fields',
        message: 'selectedWebsites and selectedCategories are required'
      });
    }

    const websitesArray = JSON.parse(selectedWebsites);
    const categoriesArray = JSON.parse(selectedCategories);

    let imageUrl = '';
    let videoUrl = '';
    let pdfUrl = '';

    // Handle file upload
    if (req.file) {
      const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
      const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: req.file.mimetype,
      });

      await new Promise((resolve, reject) => {
        blobStream.on('error', (err) => {
          console.error('Upload error:', err);
          reject(new Error('Failed to upload file.'));
        });

        blobStream.on('finish', async () => {
          try {
            await blob.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            
            if (req.file.mimetype.startsWith('image')) {
              imageUrl = publicUrl;
            } else if (req.file.mimetype.startsWith('video')) {
              videoUrl = publicUrl;
            } else if (req.file.mimetype === 'application/pdf') {
              pdfUrl = publicUrl;
            }
            resolve();
          } catch (err) {
            console.error('Error making file public:', err);
            reject(new Error('Failed to make file public.'));
          }
        });

        blobStream.end(req.file.buffer);
      });
    }

    // Fetch all selected categories to validate website associations
    const categories = await AdCategory.find({
      _id: { $in: categoriesArray }
    });

    // Create a map of websiteId to its categories for efficient lookup
    const websiteCategoryMap = categories.reduce((map, category) => {
      const websiteId = category.websiteId.toString();
      if (!map.has(websiteId)) {
        map.set(websiteId, []);
      }
      map.get(websiteId).push(category._id);
      return map;
    }, new Map());

    // Create websiteSelections array with proper category associations
    const websiteSelections = websitesArray.map(websiteId => {
      // Get categories that belong to this website
      const websiteCategories = websiteCategoryMap.get(websiteId.toString()) || [];
      
      // Filter selected categories to only include ones that belong to this website
      const validCategories = categoriesArray.filter(categoryId => 
        websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
      );

      return {
        websiteId,
        categories: validCategories,
        approved: false,
        approvedAt: null
      };
    }).filter(selection => selection.categories.length > 0); // Only include websites that have matching categories

    // Validate that we have at least one valid website-category combination
    if (websiteSelections.length === 0) {
      return res.status(400).json({
        error: 'Invalid Selection',
        message: 'No valid website and category combinations found'
      });
    }

    // Get userId from req.user with multiple fallbacks
    const ownerId = req.user.userId || req.user.id || req.user._id;

    if (!ownerId) {
      console.error('No userId found in req.user:', req.user);
      return res.status(401).json({ 
        error: 'Authentication Error',
        message: 'User ID not found in authentication data' 
      });
    }

    // Verify user exists in database
    const user = await User.findById(ownerId);
    if (!user) {
      console.error('User not found in database with ID:', ownerId);
      return res.status(401).json({ 
        error: 'User Not Found',
        message: 'User not found in database' 
      });
    }

    const userId = user._id.toString();

    // Create new ad entry with restructured data
    const newRequestAd = new ImportAd({
      userId,
      adOwnerEmail: adOwnerEmail || user.email, // Fallback to user email
      imageUrl,
      videoUrl,
      pdfUrl,
      businessName,
      businessLink,
      businessLocation,
      adDescription,
      websiteSelections,
      confirmed: false,
      clicks: 0,
      views: 0
    });

    const savedRequestAd = await newRequestAd.save();

    // Populate the saved ad with website and category details
    const populatedAd = await ImportAd.findById(savedRequestAd._id)
      .populate('websiteSelections.websiteId')
      .populate('websiteSelections.categories');

    res.status(201).json({
      success: true,
      data: populatedAd
    });

  } catch (err) {
    console.error('Error creating ad:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}];

exports.getUserMixedAds = async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch ads with populated website selections
    const mixedAds = await ImportAd.find({ userId })
      .populate({
        path: 'websiteSelections.websiteId',
        select: 'websiteName websiteLink logoUrl'
      })
      .populate({
        path: 'websiteSelections.categories',
        select: 'price ownerId categoryName'
      });

    const adsWithDetails = mixedAds.map(ad => {
      // Calculate total price across all website selections and their categories
      const totalPrice = ad.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) => 
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0);

      return {
        ...ad.toObject(),
        totalPrice,
        isConfirmed: ad.confirmed,
        // Get unique owner IDs across all categories
        categoryOwnerIds: [...new Set(ad.websiteSelections.flatMap(selection => 
          selection.categories.map(cat => cat.ownerId)))],
        clicks: ad.clicks,
        views: ad.views,
        status: ad.websiteSelections.every(sel => sel.approved) ? 'approved' : 'pending'
      };
    });

    res.status(200).json(adsWithDetails);
  } catch (error) {
    console.error('Error fetching mixed ads:', error);
    res.status(500).json({ message: 'Failed to fetch ads', error: error.message });
  }
};

exports.getAdDetails = async (req, res) => {
  const { adId } = req.params;

  try {
    const ad = await ImportAd.findById(adId)
      .populate({
        path: 'websiteSelections.websiteId',
        select: 'websiteName websiteLink'
      })
      .populate({
        path: 'websiteSelections.categories',
        select: 'categoryName price ownerId'
      });

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const adDetails = {
      ...ad.toObject(),
      totalPrice: ad.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) => 
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0),
      websiteStatuses: ad.websiteSelections.map(selection => ({
        websiteId: selection.websiteId._id,
        websiteName: selection.websiteId.websiteName,
        websiteLink: selection.websiteId.websiteLink,
        categories: selection.categories,
        approved: selection.approved,
        confirmed: selection.confirmed || false,
        approvedAt: selection.approvedAt
      }))
    };

    res.status(200).json(adDetails);
  } catch (error) {
    console.error('Error fetching ad details:', error);
    res.status(500).json({ message: 'Failed to fetch ad details', error: error.message });
  }
};

exports.confirmWebsiteAd = async (req, res) => {
  try {
    const { adId, websiteId } = req.params;

    // Find the ad and update the specific website selection
    const updatedAd = await ImportAd.findOneAndUpdate(
      { 
        _id: adId,
        'websiteSelections.websiteId': websiteId,
        'websiteSelections.approved': true // Only allow confirmation if approved
      },
      { 
        $set: { 
          'websiteSelections.$.confirmed': true,
          'websiteSelections.$.confirmedAt': new Date()
        }
      },
      { new: true }
    );

    if (!updatedAd) {
      return res.status(404).json({ 
        message: 'Ad not found or website not approved for confirmation' 
      });
    }

    // Find the relevant website selection
    const websiteSelection = updatedAd.websiteSelections.find(
      selection => selection.websiteId.toString() === websiteId
    );

    // Update the ad categories for this website
    if (websiteSelection) {
      await AdCategory.updateMany(
        { _id: { $in: websiteSelection.categories } },
        { $addToSet: { selectedAds: updatedAd._id } }
      );
    }

    res.status(200).json({ 
      message: 'Ad confirmed for selected website',
      ad: updatedAd
    });

  } catch (error) {
    console.error('Error confirming website ad:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.initiateAdPayment = async (req, res) => {
  try {
    const { adId, websiteId, amount, email, phoneNumber, userId } = req.body;

    console.log('🧪 TEST MODE: Initiating ad payment', { adId, websiteId, amount, userId });

    // Enhanced validation
    if (!adId || !websiteId || !userId) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: adId, websiteId, or userId',
        test_mode: true 
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(adId) || !mongoose.Types.ObjectId.isValid(websiteId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid adId or websiteId format',
        test_mode: true 
      });
    }

    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid amount provided',
        test_mode: true 
      });
    }

    // Check if payment already exists for this combination
    const existingPayment = await Payment.findOne({
      adId,
      websiteId,
      userId,
      status: { $in: ['pending', 'successful'] }
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: 'Payment already exists for this ad and website',
        test_mode: true
      });
    }

    // Find ad and verify it exists
    const ad = await ImportAd.findById(adId);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Advertisement not found',
        test_mode: true
      });
    }

    // Get website selection and verify it exists and is approved
    const websiteSelection = ad.websiteSelections.find(
      selection => selection.websiteId.toString() === websiteId.toString()
    );

    if (!websiteSelection) {
      return res.status(400).json({
        success: false,
        message: 'Website selection not found for this ad',
        test_mode: true
      });
    }

    if (!websiteSelection.approved) {
      return res.status(400).json({
        success: false,
        message: 'Ad is not approved for this website',
        test_mode: true
      });
    }

    if (websiteSelection.confirmed) {
      return res.status(400).json({
        success: false,
        message: 'Ad is already confirmed for this website',
        test_mode: true
      });
    }

    // Verify categories exist
    const categories = await AdCategory.find({
      _id: { $in: websiteSelection.categories },
      websiteId: websiteId
    });

    if (!categories.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid categories found for this website',
        test_mode: true
      });
    }

    const tx_ref = `TEST-AD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create payment record
    const payment = new Payment({
      tx_ref,
      amount: numericAmount,
      currency: 'USD',
      email: email || TEST_CONFIG.TEST_CUSTOMER.email,
      userId,
      adId,
      websiteId,
      webOwnerId: categories[0].ownerId,
      status: 'pending',
      testMode: true
    });

    await payment.save();

    // Updated test payment payload with proper test configuration
    const paymentPayload = {
      tx_ref,
      amount: numericAmount,
      currency: 'USD',
      redirect_url: TEST_CONFIG.REDIRECT_URL,
      payment_options: 'card,banktransfer,ussd',
      meta: {
        adId: adId.toString(),
        websiteId: websiteId.toString(),
        userId: userId.toString(),
        test_mode: true
      },
      customer: {
        email: TEST_CONFIG.TEST_CUSTOMER.email, // Use Flutterwave test email
        name: ad.businessName || TEST_CONFIG.TEST_CUSTOMER.name,
        phone_number: TEST_CONFIG.TEST_CUSTOMER.phone_number // Use Flutterwave test phone
      },
      customizations: {
        title: '🧪 TEST: Ad Space Payment',
        description: `TEST: Payment for ad space - ${ad.businessName}`,
        logo: process.env.COMPANY_LOGO_URL || ''
      },
      // Add test mode configuration
      payment_plan: null,
      subaccounts: [],
      integrity_hash: null
    };

    console.log('🧪 Sending test payment request to Flutterwave...');
    console.log('🧪 Payment payload:', JSON.stringify(paymentPayload, null, 2));

    // Make request to Flutterwave TEST API
    const response = await axios.post(
      `${TEST_CONFIG.FLUTTERWAVE_BASE_URL}/payments`, 
      paymentPayload, 
      {
        headers: { 
          Authorization: `Bearer ${TEST_CONFIG.FLW_TEST_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('🧪 Flutterwave test payment response:', JSON.stringify(response.data, null, 2));

    if (response.data?.status === 'success' && response.data?.data?.link) {
      res.status(200).json({ 
        success: true,
        paymentLink: response.data.data.link,
        tx_ref,
        message: '🧪 TEST: Payment link generated successfully',
        test_mode: true,
        test_instructions: {
          message: 'This is TEST MODE. Use these test cards:',
          successful_cards: [
            {
              number: '5531886652142950',
              cvv: '564',
              expiry: '09/32',
              pin: '3310',
              otp: '12345',
              description: 'Mastercard - Successful transaction'
            },
            {
              number: '4187427415564246',
              cvv: '828',
              expiry: '09/32',
              pin: '3310',
              otp: '12345',
              description: 'Visa - Successful transaction'
            }
          ],
          failed_cards: [
            {
              number: '5060666666666666666',
              cvv: '123',
              expiry: '09/32',
              description: 'Insufficient funds'
            },
            {
              number: '4000000000000069',
              cvv: '123',
              expiry: '09/32',
              description: 'Declined card'
            }
          ]
        }
      });
    } else {
      // Clean up failed payment record
      await Payment.findOneAndDelete({ tx_ref });
      
      throw new Error(`Invalid payment response: ${JSON.stringify(response.data)}`);
    }

  } catch (error) {
    console.error('🧪 TEST: Payment initiation error:', error.response?.data || error.message);
    
    // Clean up failed payment record if tx_ref was created
    if (req.body.tx_ref) {
      try {
        await Payment.findOneAndDelete({ tx_ref: req.body.tx_ref });
      } catch (deleteError) {
        console.error('🧪 TEST: Error deleting failed payment record:', deleteError.message);
      }
    }

    // Return specific error messages
    let errorMessage = '🧪 TEST: Error initiating payment';
    let statusCode = 500;

    if (error.response?.status === 400) {
      errorMessage = `🧪 TEST: Invalid payment data - ${error.response.data?.message || 'Bad request'}`;
      statusCode = 400;
    } else if (error.response?.status === 401) {
      errorMessage = '🧪 TEST: Payment service authentication failed - check your test API key';
      statusCode = 401;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      errorMessage = '🧪 TEST: Payment service temporarily unavailable';
      statusCode = 503;
    }

    res.status(statusCode).json({ 
      success: false,
      message: errorMessage,
      test_mode: true,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      flutterwave_error: error.response?.data
    });
  }
};

exports.adPaymentCallback = async (req, res) => {
  console.log('🧪 TEST: Payment callback received:', req.query);
  
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    const { tx_ref, transaction_id, status: queryStatus } = req.query;
    
    if (!tx_ref || !transaction_id) {
      console.error('🧪 TEST: Missing required callback parameters');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/approved-ads?status=invalid-params&test=true`);
    }

    // Find the payment record first
    const payment = await Payment.findOne({ tx_ref });
    if (!payment) {
      console.error('🧪 TEST: Payment record not found for tx_ref:', tx_ref);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/approved-ads?status=payment-not-found&test=true`);
    }

    console.log('🧪 TEST: Verifying transaction with Flutterwave...');

    // Verify the transaction with Flutterwave TEST API
    const transactionVerification = await axios.get(
      `${TEST_CONFIG.FLUTTERWAVE_BASE_URL}/transactions/${transaction_id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${TEST_CONFIG.FLW_TEST_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const transactionData = transactionVerification.data.data;
    const { status, amount, currency, tx_ref: verifiedTxRef } = transactionData;

    console.log('🧪 TEST: Transaction verification result:', { status, amount, currency, verifiedTxRef });

    // Verify transaction reference matches
    if (verifiedTxRef !== tx_ref) {
      console.error('🧪 TEST: Transaction reference mismatch');
      payment.status = 'failed';
      await payment.save();
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/approved-ads?status=tx-ref-mismatch&test=true`);
    }

    // Verify payment amount and currency (with tolerance for floating point)
    if (Math.abs(payment.amount - amount) > 0.01 || payment.currency !== currency) {
      console.error('🧪 TEST: Payment amount or currency mismatch:', {
        expected: { amount: payment.amount, currency: payment.currency },
        received: { amount, currency }
      });
      payment.status = 'failed';
      await payment.save();
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/approved-ads?status=amount-mismatch&test=true`);
    }

    if (status === 'successful') {
      console.log('🧪 TEST: Processing successful payment...');
      
      // Start transaction
      await session.startTransaction();
      transactionStarted = true;

      // Process successful payment
      await processSuccessfulPayment(payment, session);
      
      // Update payment status
      payment.status = 'successful';
      payment.processedAt = new Date();
      await payment.save({ session });

      await session.commitTransaction();
      transactionStarted = false;

      console.log('🧪 TEST: Payment processed successfully for tx_ref:', tx_ref);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/approved-ads?status=success&test=true`);
      
    } else {
      payment.status = 'failed';
      payment.failureReason = transactionData.processor_response || 'Payment failed';
      await payment.save();
      
      console.log('🧪 TEST: Payment failed for tx_ref:', tx_ref, 'Status:', status);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/approved-ads?status=failed&test=true`);
    }

  } catch (error) {
    console.error('🧪 TEST: Payment callback error:', error.message);
    
    if (transactionStarted) {
      await session.abortTransaction();
    }
    
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/approved-ads?status=error&test=true`);
  } finally {
    await session.endSession();
  }
};

async function processSuccessfulPayment(payment, session) {
  console.log('🧪 TEST: Processing successful payment for ad:', payment.adId);
  
  // Find the ad
  const ad = await ImportAd.findOne({ _id: payment.adId }).session(session);
  if (!ad) {
    throw new Error('Advertisement not found');
  }

  // Find the specific website selection using the websiteId from payment
  const websiteSelection = ad.websiteSelections.find(
    sel => sel.websiteId.toString() === payment.websiteId.toString()
  );
  
  if (!websiteSelection) {
    throw new Error('Website selection not found');
  }

  if (!websiteSelection.approved || websiteSelection.confirmed) {
    throw new Error('Website selection is not approved or already confirmed');
  }

  // Update the ad confirmation status
  const updatedAd = await ImportAd.findOneAndUpdate(
    { 
      _id: payment.adId,
      'websiteSelections': {
        $elemMatch: {
          websiteId: payment.websiteId,
          approved: true,
          confirmed: { $ne: true }
        }
      }
    },
    { 
      $set: { 
        'websiteSelections.$.confirmed': true,
        'websiteSelections.$.confirmedAt': new Date()
      }
    },
    { new: true, session }
  );

  if (!updatedAd) {
    throw new Error('Failed to update ad confirmation status');
  }

  console.log('🧪 TEST: Ad confirmed successfully');

  // Find categories
  const categories = await AdCategory.find({
    _id: { $in: websiteSelection.categories },
    websiteId: payment.websiteId
  }).session(session);

  if (!categories.length) {
    throw new Error('No valid categories found');
  }

  // Update categories
  await AdCategory.updateMany(
    { 
      _id: { $in: websiteSelection.categories },
      websiteId: payment.websiteId
    },
    { $addToSet: { selectedAds: updatedAd._id } },
    { session }
  );

  console.log('🧪 TEST: Categories updated with new ad');

  // Update web owner's balance
  await WebOwnerBalance.findOneAndUpdate(
    { userId: payment.webOwnerId },
    {
      $inc: {
        totalEarnings: payment.amount,
        availableBalance: payment.amount
      }
    },
    { upsert: true, session }
  );

  console.log('🧪 TEST: Web owner balance updated');

  // Create payment trackers
  const paymentTrackers = categories.map(category => ({
    userId: payment.webOwnerId,
    adId: ad._id,
    categoryId: category._id,
    paymentDate: new Date(),
    amount: payment.amount / categories.length,
    viewsRequired: category.visitorRange?.max || 1000,
    currentViews: 0,
    status: 'pending',
    paymentReference: payment.tx_ref,
    testMode: true
  }));

  await PaymentTracker.insertMany(paymentTrackers, { session });
  
  console.log('🧪 TEST: Payment trackers created:', paymentTrackers.length);
}