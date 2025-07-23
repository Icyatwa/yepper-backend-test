// WebAdvertiseController.js
const multer = require('multer');
const path = require('path');
const bucket = require('../../config/storage');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const User = require('../../models/User');
const WebOwnerBalance = require('../../AdPromoter/models/WebOwnerBalanceModel');
const sendEmailNotification = require('../../controllers/emailService');

class PaymentService {
  // Simulate successful payment response for test mode
  static simulateTestPayment(paymentPayload) {
    const testLink = `${process.env.BASE_URL || 'https://yepper-backend.onrender.com'}/api/accept/test-payment?tx_ref=${paymentPayload.tx_ref}&amount=${paymentPayload.amount}`;
    
    return {
      data: {
        status: 'success',
        message: 'Payment link generated successfully (TEST MODE)',
        data: {
          link: testLink,
          test_mode: true,
          payment_details: paymentPayload
        }
      }
    };
  }
}

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

    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        message: 'Invalid amount provided',
        testMode: TEST_MODE
      });
    }

    // Check if the ad is already confirmed for this website
    const existingAd = await ImportAd.findOne({
      _id: adId,
      'websiteSelections': {
        $elemMatch: {
          websiteId: websiteId,
          confirmed: true
        }
      }
    });

    if (existingAd) {
      return res.status(400).json({ 
        message: 'Ad payment already completed for this website',
        testMode: TEST_MODE
      });
    }

    // Find ad and verify it's approved but not confirmed
    const ad = await ImportAd.findOne({
      _id: adId,
      'websiteSelections': {
        $elemMatch: {
          websiteId: websiteId,
          approved: true,
          confirmed: { $ne: true }
        }
      }
    });

    if (!ad) {
      return res.status(404).json({ 
        message: 'Ad not found or not approved for this website',
        testMode: TEST_MODE
      });
    }

    // Get website selection and verify categories
    const websiteSelection = ad.websiteSelections.find(
      selection => selection.websiteId.toString() === websiteId.toString()
    );

    if (!websiteSelection) {
      return res.status(404).json({ 
        message: 'Website selection not found',
        testMode: TEST_MODE
      });
    }

    // Verify categories exist
    const categories = await AdCategory.find({
      _id: { $in: websiteSelection.categories },
      websiteId: websiteId
    });

    if (!categories.length) {
      return res.status(404).json({ 
        message: 'No valid categories found for this website',
        testMode: TEST_MODE
      });
    }

    const tx_ref = `${TEST_MODE ? 'TEST-' : ''}AD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const payment = new Payment({
      tx_ref,
      amount: numericAmount,
      currency: 'USD',
      email,
      userId,
      adId,
      websiteId,
      webOwnerId: categories[0].ownerId,
      status: 'pending',
      testMode: TEST_MODE
    });

    await payment.save();

    const paymentPayload = {
      tx_ref,
      amount: numericAmount,
      currency: 'USD',
      redirect_url: `${process.env.BASE_URL || 'https://yepper-backend.onrender.com'}/api/accept/callback`,
      payment_options: 'card',
      meta: {
        adId: adId.toString(),
        websiteId: websiteId.toString(),
        userId: userId.toString(),
        testMode: TEST_MODE
      },
      customer: {
        email: email.trim(),
        name: ad.businessName || 'Ad Customer',
        ...(phoneNumber && { phone_number: phoneNumber })
      },
      customizations: {
        title: TEST_MODE ? 'Test Ad Space Payment' : 'Ad Space Payment',
        description: `${TEST_MODE ? 'TEST: ' : ''}Payment for ad space - ${ad.businessName}`,
        logo: process.env.COMPANY_LOGO_URL || ''
      }
    };

    let response;

    try {
      if (TEST_MODE) {
        // Simulate payment in test mode
        console.log('🧪 TEST MODE: Simulating payment initiation:', paymentPayload);
        response = PaymentService.simulateTestPayment(paymentPayload);
        
        // Add delay to simulate real API call
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // Real payment via Flutterwave
        response = await axios.post(
          `${FLW_BASE_URL}/payments`, 
          paymentPayload, 
          {
            headers: { 
              Authorization: `Bearer ${FLW_SECRET_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
      }

      if (response.data?.status === 'success' && response.data?.data?.link) {
        res.status(200).json({ 
          success: true,
          paymentLink: response.data.data.link,
          tx_ref,
          message: TEST_MODE ? 'Test payment link generated successfully' : 'Payment link generated successfully',
          testMode: TEST_MODE,
          ...(TEST_MODE && { 
            note: 'This is a test payment - no real money will be charged',
            testInstructions: 'Use the test payment link to simulate successful/failed payments'
          })
        });
      } else {
        throw new Error(`Invalid payment response: ${JSON.stringify(response.data)}`);
      }

    } catch (error) {
      // Clean up failed payment record
      if (error.response?.status >= 400) {
        try {
          await Payment.findOneAndDelete({ tx_ref });
        } catch (deleteError) {
          console.error('Error deleting failed payment record:', deleteError.message);
        }
      }

      // Return specific error messages
      let errorMessage = TEST_MODE ? 'Error initiating test payment' : 'Error initiating payment';
      let statusCode = 500;

      if (error.response?.status === 400) {
        errorMessage = 'Invalid payment data provided';
        statusCode = 400;
      } else if (error.response?.status === 401) {
        errorMessage = 'Payment service authentication failed';
        statusCode = 401;
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        errorMessage = 'Payment service temporarily unavailable';
        statusCode = 503;
      }

      res.status(statusCode).json({ 
        success: false,
        message: errorMessage,
        testMode: TEST_MODE,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ 
      success: false,
      message: TEST_MODE ? 'Error processing test payment request' : 'Error processing payment request',
      testMode: TEST_MODE,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.testPaymentPage = async (req, res) => {
  if (!TEST_MODE) {
    return res.status(403).json({ message: 'This endpoint is only available in test mode' });
  }

  const { tx_ref, amount } = req.query;
  
  if (!tx_ref || !amount) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  // Simple HTML page for test payments
  const testPageHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Payment - Yepper</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .container { background: #f5f5f5; padding: 30px; border-radius: 10px; text-align: center; }
            .amount { font-size: 24px; color: #2c5aa0; font-weight: bold; margin: 20px 0; }
            .button { padding: 12px 24px; margin: 10px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
            .success { background: #28a745; color: white; }
            .failed { background: #dc3545; color: white; }
            .warning { background: #ffc107; color: #212529; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🧪 Test Payment</h2>
            <div class="warning">
                <strong>TEST MODE:</strong> This is a simulated payment. No real money will be charged.
            </div>
            <p>Transaction Reference: <strong>${tx_ref}</strong></p>
            <div class="amount">Amount: $${amount}</div>
            <p>Choose a test outcome:</p>
            <button class="button success" onclick="processPayment(true)">✅ Simulate Successful Payment</button>
            <button class="button failed" onclick="processPayment(false)">❌ Simulate Failed Payment</button>
        </div>

        <script>
            function processPayment(success) {
                const status = success ? 'successful' : 'failed';
                const transactionId = 'test_' + Date.now();
                
                // Redirect to callback with test parameters
                window.location.href = '/api/accept/callback?tx_ref=${tx_ref}&transaction_id=' + transactionId + '&status=' + status;
            }
        </script>
    </body>
    </html>
  `;

  res.send(testPageHTML);
};

exports.adPaymentCallback = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    const { tx_ref, transaction_id, status: queryStatus } = req.query;
    
    console.log(TEST_MODE ? '🧪 TEST MODE: Payment callback received:' : 'Payment callback received:', { tx_ref, transaction_id, queryStatus });
    
    if (!tx_ref || !transaction_id) {
      console.error('Missing required callback parameters');
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=invalid-params&test=${TEST_MODE}`);
    }

    // Find the payment record first
    const payment = await Payment.findOne({ tx_ref });
    if (!payment) {
      console.error('Payment record not found for tx_ref:', tx_ref);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=payment-not-found&test=${TEST_MODE}`);
    }

    let transactionData;

    if (TEST_MODE) {
      // Simulate transaction verification in test mode
      transactionData = {
        status: queryStatus || 'successful',
        amount: payment.amount,
        currency: payment.currency,
        tx_ref: tx_ref,
        id: transaction_id,
        test_mode: true
      };
      console.log('🧪 TEST MODE: Simulated transaction verification:', transactionData);
    } else {
      // Verify the transaction with Flutterwave
      const transactionVerification = await axios.get(
        `${FLW_BASE_URL}/transactions/${transaction_id}/verify`,
        {
          headers: {
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      transactionData = transactionVerification.data.data;
    }

    const { status, amount, currency, tx_ref: verifiedTxRef } = transactionData;

    // Verify transaction reference matches
    if (verifiedTxRef !== tx_ref) {
      console.error('Transaction reference mismatch');
      payment.status = 'failed';
      await payment.save();
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=tx-ref-mismatch&test=${TEST_MODE}`);
    }

    // Verify payment amount and currency
    if (Math.abs(payment.amount - amount) > 0.01 || payment.currency !== currency) {
      console.error('Payment amount or currency mismatch:', {
        expected: { amount: payment.amount, currency: payment.currency },
        received: { amount, currency }
      });
      payment.status = 'failed';
      await payment.save();
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=amount-mismatch&test=${TEST_MODE}`);
    }

    if (status === 'successful') {
      // Start transaction
      await session.startTransaction();
      transactionStarted = true;

      // Process successful payment
      await processSuccessfulPayment(payment, session);
      
      // Update payment status
      payment.status = 'successful';
      payment.completedAt = new Date();
      if (TEST_MODE) {
        payment.testTransactionData = transactionData;
      }
      await payment.save({ session });

      await session.commitTransaction();
      transactionStarted = false;

      console.log(TEST_MODE ? '🧪 TEST MODE: Payment processed successfully for tx_ref:' : 'Payment processed successfully for tx_ref:', tx_ref);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=success&test=${TEST_MODE}`);
      
    } else {
      payment.status = 'failed';
      payment.failureReason = queryStatus || 'Payment failed';
      if (TEST_MODE) {
        payment.testTransactionData = transactionData;
      }
      await payment.save();
      console.log(TEST_MODE ? '🧪 TEST MODE: Payment failed for tx_ref:' : 'Payment failed for tx_ref:', tx_ref, 'Status:', status);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=failed&test=${TEST_MODE}`);
    }

  } catch (error) {
    console.error('Payment callback error:', error.message);
    
    if (transactionStarted) {
      await session.abortTransaction();
    }
    
    return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=error&test=${TEST_MODE}`);
  } finally {
    await session.endSession();
  }
};

async function processSuccessfulPayment(payment, session) {
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
        'websiteSelections.$.confirmedAt': new Date(),
        ...(TEST_MODE && { 'websiteSelections.$.testMode': true })
      }
    },
    { new: true, session }
  );

  if (!updatedAd) {
    throw new Error('Failed to update ad confirmation status');
  }

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

  // Update web owner's balance
  await WebOwnerBalance.findOneAndUpdate(
    { userId: payment.webOwnerId },
    {
      $inc: {
        totalEarnings: payment.amount,
        availableBalance: payment.amount
      },
      ...(TEST_MODE && { lastTestPayment: new Date() })
    },
    { upsert: true, session }
  );

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
    testMode: TEST_MODE
  }));

  await PaymentTracker.insertMany(paymentTrackers, { session });
}