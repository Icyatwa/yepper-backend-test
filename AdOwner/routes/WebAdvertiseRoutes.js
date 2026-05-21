// WebAdvertiseRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const WebAdvertiseController = require('../controllers/WebAdvertiseController');
const PaymentController = require('../controllers/PaymentController');
const availableAdsController = require('../controllers/AvailableAdsController');
const authMiddleware = require('../../middleware/authmiddleware');

const Payment = require('../models/PaymentModel');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const { Wallet } = require('../../AdPromoter/models/walletModel');

router.post('/', authMiddleware, WebAdvertiseController.createImportAd);
router.put('/ads/:adId/update-selections', authMiddleware, WebAdvertiseController.updateAdSelections);
router.get('/my-ads', authMiddleware, WebAdvertiseController.getMyAds);
router.get('/ad-details/:adId', WebAdvertiseController.getAd);
router.get('/:adId', authMiddleware, WebAdvertiseController.getAdDetails);
router.get('/budget', authMiddleware, WebAdvertiseController.getAdBudget);
router.post('/:adId/add-selections', authMiddleware, WebAdvertiseController.addWebsiteSelectionsToAd);
router.put('/:adId/update', authMiddleware, WebAdvertiseController.updateAdDetails);
router.get('/available/:websiteId', authMiddleware, WebAdvertiseController.getAvailableAdsForWebsite);
router.post('/select-for-website', authMiddleware, WebAdvertiseController.selectAdForWebsite);
router.get('/mixed/:userId', WebAdvertiseController.getUserMixedAds);
router.get('/:adId/refund-info', authMiddleware, WebAdvertiseController.getAdRefundInfo);
router.get('/reassignable', authMiddleware, WebAdvertiseController.getReassignableAds);
router.post('/:adId/reassign', authMiddleware, WebAdvertiseController.reassignAdWithRefund);


router.use('/payment/*', (req, res, next) => {
  console.log('=== PAYMENT ROUTE HIT ===');
  console.log('Method:', req.method);
  console.log('Original URL:', req.originalUrl);
  console.log('Route Path:', req.route?.path);
  console.log('Params:', req.params);
  console.log('Body:', req.body);
  console.log('========================');
  next();
});

router.get('/payment/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Payment service is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

router.post('/payment/initiate', authMiddleware, PaymentController.initiatePayment);
router.post('/payment/verify', PaymentController.verifyPayment);

router.post('/payment/verify-non-transactional', PaymentController.verifyPaymentNonTransactional || ((req, res) => {
  res.status(501).json({ error: 'Method not implemented yet' });
}));
router.post('/payment/initiate-with-refund', authMiddleware, PaymentController.initiatePaymentWithRefund);
router.post('/payment/process-wallet', authMiddleware, PaymentController.handleProcessWallet);
router.post('/payment/verify-with-refund', authMiddleware, async (req, res) => {
  console.log('=== PAYMENT VERIFY CALLED (AUTH) ===');
  console.log('Body:', req.body);
  
  const session = await mongoose.startSession();
  
  try {
    const { transaction_id, tx_ref } = req.body;
    const identifier = transaction_id || tx_ref;
    
    if (!identifier) {
      return res.status(400).json({ 
        success: false,
        error: 'Transaction ID or tx_ref required' 
      });
    }

    // FIXED: Use correct Flutterwave API endpoint and method
    const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_TEST_SECRET_KEY;
    
    if (!flutterwaveSecretKey) {
      console.error('Flutterwave secret key missing');
      return res.status(500).json({ 
        success: false,
        error: 'Payment service configuration missing' 
      });
    }

    console.log('Verifying transaction with Flutterwave:', identifier);
    console.log('Using API key ending with:', flutterwaveSecretKey.slice(-4));

    // FIXED: Use GET request instead of POST for verification
    const flutterwaveResponse = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${identifier}/verify`,
      {
        headers: {
          'Authorization': `Bearer ${flutterwaveSecretKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('Flutterwave response status:', flutterwaveResponse.status);
    console.log('Flutterwave response data:', flutterwaveResponse.data);

    if (flutterwaveResponse.data.status === 'success' && flutterwaveResponse.data.data.status === 'successful') {
      const flwData = flutterwaveResponse.data.data;
      
      // Find payment record
      const payment = await Payment.findOne({ 
        $or: [
          { tx_ref: flwData.tx_ref },
          { paymentId: identifier },
          { tx_ref: tx_ref } // Also try the provided tx_ref
        ]
      });

      if (!payment) {
        console.log('Payment record not found. Searched for:', {
          flw_tx_ref: flwData.tx_ref,
          provided_tx_ref: tx_ref,
          transaction_id: identifier
        });
        return res.status(404).json({ 
          success: false,
          error: 'Payment record not found in database',
          searched: {
            flw_tx_ref: flwData.tx_ref,
            provided_tx_ref: tx_ref,
            transaction_id: identifier
          }
        });
      }

      console.log('Found payment:', {
        id: payment._id,
        status: payment.status,
        tx_ref: payment.tx_ref,
        amount: payment.amount
      });

      if (payment.status === 'successful') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed successfully',
          payment: payment.getPaymentSummary(),
          alreadyProcessed: true
        });
      }

      // Process the payment
      let processedPayment;
      await session.withTransaction(async () => {
        // Update payment status
        payment.status = 'successful';
        payment.paidAt = new Date();
        payment.paymentId = flwData.id;
        payment.flutterwaveData = new Map(Object.entries(flwData));
        await payment.save({ session });

        console.log('Updated payment status to successful');

        // Deduct wallet if used
        if (payment.walletApplied && payment.walletApplied > 0) {
          const walletUpdate = await Wallet.findOneAndUpdate(
            { ownerId: payment.advertiserId, ownerType: 'advertiser' },
            { 
              $inc: { 
                balance: -payment.walletApplied,
                totalSpent: payment.walletApplied
              },
              lastUpdated: new Date()
            },
            { session, new: true }
          );
          console.log('Wallet deducted:', payment.walletApplied, 'New balance:', walletUpdate?.balance);
        }

        // Mark refunds as used (only for non-reassignment)
        if (payment.refundApplied && payment.refundApplied > 0 && !payment.isReassignment) {
          console.log('Processing refund usage:', payment.refundApplied);
          
          const refundPayments = await Payment.find({
            advertiserId: payment.advertiserId,
            status: { $in: ['refunded', 'internally_refunded'] },
            refundUsed: { $ne: true }
          }).sort({ refundedAt: 1 }).session(session);

          let remainingRefund = payment.refundApplied;
          const refundSources = [];
          
          for (const refund of refundPayments) {
            if (remainingRefund <= 0) break;
            
            const useAmount = Math.min(remainingRefund, refund.amount);
            refund.refundUsed = true;
            refund.refundUsedAt = new Date();
            refund.refundUsedForPayment = payment._id;
            refund.refundUsageAmount = useAmount;
            await refund.save({ session });
            
            refundSources.push({
              sourcePaymentId: refund._id,
              amountUsed: useAmount,
              usedAt: new Date()
            });
            
            remainingRefund -= useAmount;
          }
          
          payment.refundSources = refundSources;
          await payment.save({ session });
        }

        // Activate the ad
        const adUpdate = await ImportAd.findOneAndUpdate(
          { 
            _id: payment.adId,
            'websiteSelections.websiteId': payment.websiteId,
            'websiteSelections.categories': payment.categoryId
          },
          {
            $set: {
              'websiteSelections.$.approved': true,
              'websiteSelections.$.status': 'active',
              'websiteSelections.$.publishedAt': new Date()
            }
          },
          { session, new: true }
        );

        console.log('Ad activation result:', !!adUpdate);

        // Update category
        await AdCategory.findByIdAndUpdate(
          payment.categoryId,
          { $addToSet: { selectedAds: payment.adId } },
          { session }
        );

        // Update website owner wallet
        const category = await AdCategory.findById(payment.categoryId).session(session);
        if (category && category.ownerId) {
          const webOwnerWallet = await Wallet.findOneAndUpdate(
            { ownerId: category.ownerId, ownerType: 'webOwner' },
            { 
              $inc: { 
                balance: payment.amount,
                totalEarned: payment.amount
              },
              lastUpdated: new Date()
            },
            { session, upsert: true, new: true }
          );
          console.log('Web owner wallet updated:', webOwnerWallet.balance);
        }

        processedPayment = payment;
      });

      return res.status(200).json({
        success: true,
        message: `Payment verified successfully! ${payment.isReassignment ? 'Ad reassignment' : 'New ad placement'} is now active.`,
        payment: processedPayment.getPaymentSummary(),
        flutterwaveData: {
          transactionId: flwData.id,
          amount: flwData.amount,
          currency: flwData.currency,
          status: flwData.status
        }
      });

    } else {
      console.log('Flutterwave verification failed:', flutterwaveResponse.data);
      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed with Flutterwave',
        details: flutterwaveResponse.data 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    
    // Handle Flutterwave API errors specifically
    if (error.response) {
      console.error('Flutterwave API error details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      });

      if (error.response.status === 401) {
        return res.status(500).json({ 
          success: false, 
          error: 'Payment service authentication failed - invalid API key',
          message: 'Flutterwave API authentication failed'
        });
      } else if (error.response.status === 404) {
        return res.status(404).json({ 
          success: false, 
          error: 'Transaction not found on Flutterwave',
          message: `Transaction ${identifier} not found on payment gateway`
        });
      } else if (error.response.status === 429) {
        return res.status(429).json({ 
          success: false, 
          error: 'Rate limit exceeded',
          message: 'Too many requests to payment gateway'
        });
      }
    }
    
    return res.status(500).json({ 
      success: false, 
      error: 'Payment verification failed', 
      message: error.message,
      details: error.response?.data || null
    });
  } finally {
    await session.endSession();
  }
});

router.post('/payment/verify-callback', async (req, res) => {
  console.log('=== PUBLIC PAYMENT CALLBACK VERIFY ===');
  console.log('Body:', req.body);
  
  const session = await mongoose.startSession();
  
  try {
    const { transaction_id, tx_ref } = req.body;
    const identifier = transaction_id || tx_ref;
    
    if (!identifier) {
      return res.status(400).json({ 
        success: false,
        error: 'Transaction ID or tx_ref required' 
      });
    }

    // Verify with Flutterwave
    const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_TEST_SECRET_KEY;
    
    if (!flutterwaveSecretKey) {
      return res.status(500).json({ 
        success: false,
        error: 'Payment service configuration missing' 
      });
    }

    console.log('Verifying with Flutterwave:', identifier);

    const flutterwaveResponse = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${identifier}/verify`,
      {
        headers: {
          'Authorization': `Bearer ${flutterwaveSecretKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('Flutterwave verification response:', {
      status: flutterwaveResponse.status,
      dataStatus: flutterwaveResponse.data.status,
      transactionStatus: flutterwaveResponse.data.data?.status
    });

    if (flutterwaveResponse.data.status === 'success' && flutterwaveResponse.data.data.status === 'successful') {
      const flwData = flutterwaveResponse.data.data;
      
      // FIXED: Search by baseReference instead of tx_ref
      // The tx_ref from Flutterwave is the baseReference we used for the payment URL
      const payments = await Payment.find({ 
        baseReference: flwData.tx_ref, // Use baseReference to find grouped payments
        status: 'pending'
      }).sort({ createdAt: 1 });

      console.log(`Searching for payments with baseReference: ${flwData.tx_ref}`);
      console.log(`Found ${payments.length} pending payment records`);

      if (!payments || payments.length === 0) {
        console.log('No pending payment records found for baseReference:', flwData.tx_ref);
        
        // Check if already processed using baseReference
        const processedPayments = await Payment.find({
          baseReference: flwData.tx_ref,
          status: 'successful'
        });
        
        console.log(`Found ${processedPayments.length} already processed payments`);
        
        if (processedPayments.length > 0) {
          return res.status(200).json({ 
            success: true, 
            message: 'Payment already processed successfully',
            alreadyProcessed: true,
            paymentsCount: processedPayments.length,
            baseReference: flwData.tx_ref
          });
        }
        
        // Also try searching by tx_ref as fallback for old records
        const fallbackPayments = await Payment.find({
          tx_ref: flwData.tx_ref,
          $or: [
            { status: 'pending' },
            { status: 'successful' }
          ]
        });
        
        console.log(`Fallback search found ${fallbackPayments.length} payments with tx_ref`);
        
        if (fallbackPayments.length > 0) {
          if (fallbackPayments[0].status === 'successful') {
            return res.status(200).json({ 
              success: true, 
              message: 'Payment already processed successfully',
              alreadyProcessed: true,
              paymentsCount: fallbackPayments.length,
              fallbackMode: true
            });
          }
          // If found pending payments via fallback, process them
          payments.push(...fallbackPayments.filter(p => p.status === 'pending'));
        }
        
        if (payments.length === 0) {
          return res.status(404).json({ 
            success: false,
            error: 'No payment records found in database',
            baseReference: flwData.tx_ref,
            searched: {
              baseReference: flwData.tx_ref,
              tx_ref: flwData.tx_ref,
              transaction_id: transaction_id
            },
            message: 'Payment records may not have been created before Flutterwave redirect'
          });
        }
      }

      console.log(`Processing ${payments.length} payment record(s)`);

      // Process all payments in transaction
      let processedResults = [];
      await session.withTransaction(async () => {
        for (let i = 0; i < payments.length; i++) {
          const payment = payments[i];
          console.log(`Processing payment ${i + 1}/${payments.length}:`, {
            id: payment._id,
            tx_ref: payment.tx_ref,
            baseReference: payment.baseReference,
            amount: payment.amount,
            adId: payment.adId,
            categoryId: payment.categoryId
          });

          // Update payment status and add Flutterwave data
          payment.status = 'successful';
          payment.paidAt = new Date();
          payment.paymentId = `${flwData.id}_${i}`; // Make unique for each payment in group
          payment.flutterwaveData = new Map(Object.entries(flwData));
          await payment.save({ session });

          // Deduct wallet if used (for each payment separately)
          if (payment.walletApplied && payment.walletApplied > 0) {
            const walletUpdate = await Wallet.findOneAndUpdate(
              { ownerId: payment.advertiserId, ownerType: 'advertiser' },
              { 
                $inc: { 
                  balance: -payment.walletApplied,
                  totalSpent: payment.walletApplied
                },
                lastUpdated: new Date()
              },
              { session, new: true }
            );
            console.log(`Wallet deducted for payment ${i + 1}:`, {
              amount: payment.walletApplied,
              newBalance: walletUpdate?.balance || 'not found'
            });
          }

          // Handle refunds (only for non-reassignment)
          if (payment.refundApplied && payment.refundApplied > 0 && !payment.isReassignment) {
            console.log(`Processing refund application for payment ${i + 1}:`, payment.refundApplied);
            
            const refundPayments = await Payment.find({
              advertiserId: payment.advertiserId,
              status: { $in: ['refunded', 'internally_refunded'] },
              refundUsed: { $ne: true }
            }).sort({ refundedAt: 1 }).session(session);

            let remainingRefund = payment.refundApplied;
            const refundSources = [];
            
            for (const refund of refundPayments) {
              if (remainingRefund <= 0) break;
              
              const useAmount = Math.min(remainingRefund, refund.amount);
              refund.refundUsed = true;
              refund.refundUsedAt = new Date();
              refund.refundUsedForPayment = payment._id;
              refund.refundUsageAmount = useAmount;
              await refund.save({ session });
              
              refundSources.push({
                sourcePaymentId: refund._id,
                amountUsed: useAmount,
                usedAt: new Date()
              });
              
              remainingRefund -= useAmount;
            }
            
            payment.refundSources = refundSources;
            await payment.save({ session });
          }

          // Activate the ad
          const adUpdate = await ImportAd.findOneAndUpdate(
            { 
              _id: payment.adId,
              'websiteSelections.websiteId': payment.websiteId,
              'websiteSelections.categories': payment.categoryId
            },
            {
              $set: {
                'websiteSelections.$.approved': true,
                'websiteSelections.$.status': 'active',
                'websiteSelections.$.publishedAt': new Date(),
                'websiteSelections.$.paymentId': payment._id,
                'websiteSelections.$.rejectionDeadline': new Date(Date.now() + 2 * 60 * 1000) // 2 minutes
              }
            },
            { session, new: true }
          );

          console.log(`Ad activation result for payment ${i + 1}:`, !!adUpdate);

          // Update category
          await AdCategory.findByIdAndUpdate(
            payment.categoryId,
            { $addToSet: { selectedAds: payment.adId } },
            { session }
          );

          // Update website owner wallet
          const category = await AdCategory.findById(payment.categoryId).session(session);
          if (category && category.ownerId) {
            const webOwnerWallet = await Wallet.findOneAndUpdate(
              { ownerId: category.ownerId, ownerType: 'webOwner' },
              { 
                $inc: { 
                  balance: payment.amount,
                  totalEarned: payment.amount
                },
                lastUpdated: new Date()
              },
              { session, upsert: true, new: true }
            );
            console.log(`Web owner wallet updated for payment ${i + 1}:`, {
              ownerId: category.ownerId,
              earned: payment.amount,
              newBalance: webOwnerWallet?.balance || 'not found'
            });
          }

          processedResults.push({
            paymentId: payment._id,
            amount: payment.amount,
            adId: payment.adId,
            categoryId: payment.categoryId,
            isReassignment: payment.isReassignment,
            walletApplied: payment.walletApplied || 0,
            refundApplied: payment.refundApplied || 0
          });
        }
      });

      console.log('All payments processed successfully:', processedResults.length);

      // Calculate totals for response
      const totalWalletUsed = processedResults.reduce((sum, r) => sum + (r.walletApplied || 0), 0);
      const totalRefundUsed = processedResults.reduce((sum, r) => sum + (r.refundApplied || 0), 0);
      const totalAmount = processedResults.reduce((sum, r) => sum + r.amount, 0);

      return res.status(200).json({
        success: true,
        message: `Payment verified successfully! ${payments.length} ad placement(s) now active.`,
        paymentsProcessed: processedResults.length,
        isReassignment: payments[0]?.isReassignment || false,
        baseReference: flwData.tx_ref,
        summary: {
          totalAmount: totalAmount,
          walletUsed: totalWalletUsed,
          refundUsed: totalRefundUsed,
          cardAmount: flwData.amount,
          paymentsCount: processedResults.length
        },
        flutterwaveData: {
          transactionId: flwData.id,
          amount: flwData.amount,
          currency: flwData.currency,
          status: flwData.status,
          tx_ref: flwData.tx_ref
        },
        results: processedResults
      });

    } else {
      console.log('Flutterwave verification failed:', flutterwaveResponse.data);
      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed with Flutterwave',
        details: flutterwaveResponse.data 
      });
    }

  } catch (error) {
    console.error('Payment callback verification error:', error);
    
    if (error.response && error.response.data) {
      console.error('Flutterwave API error:', error.response.data);
    }
    
    let errorMessage = 'Payment verification failed';
    let statusCode = 500;
    
    if (error.response?.status === 401) {
      errorMessage = 'Payment service authentication failed - check API keys';
      statusCode = 500;
    } else if (error.response?.status === 404) {
      errorMessage = 'Transaction not found on Flutterwave';
      statusCode = 404;
    } else if (error.code === 11000) {
      errorMessage = 'Duplicate payment processing attempt';
      statusCode = 409;
    }
    
    return res.status(statusCode).json({ 
      success: false, 
      error: errorMessage, 
      message: error.message,
      details: error.response?.data || null
    });
  } finally {
    await session.endSession();
  }
});

router.get('/payment/debug-config', (req, res) => {
  const flwTestKey = process.env.FLW_TEST_SECRET_KEY;
  const flwProdKey = process.env.FLUTTERWAVE_SECRET_KEY;
  
  res.json({
    hasTestKey: !!flwTestKey,
    hasProductionKey: !!flwProdKey,
    testKeyPrefix: flwTestKey ? flwTestKey.substring(0, 15) + '...' : null,
    prodKeyPrefix: flwProdKey ? flwProdKey.substring(0, 15) + '...' : null,
    keyBeingUsed: flwProdKey ? 'production' : (flwTestKey ? 'test' : 'none'),
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});

// Test the Flutterwave API connection
router.get('/payment/test-flutterwave', async (req, res) => {
  try {
    const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_TEST_SECRET_KEY;
    
    if (!flutterwaveSecretKey) {
      return res.status(500).json({ 
        success: false,
        error: 'No Flutterwave secret key configured'
      });
    }

    // Test API connection with a simple request
    const testResponse = await axios.get(
      'https://api.flutterwave.com/v3/transactions?status=successful&limit=1',
      {
        headers: {
          'Authorization': `Bearer ${flutterwaveSecretKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    res.json({
      success: true,
      message: 'Flutterwave API connection successful',
      status: testResponse.status,
      apiWorking: true,
      keyValid: true
    });

  } catch (error) {
    console.error('Flutterwave test error:', error);
    
    res.status(400).json({
      success: false,
      error: 'Flutterwave API test failed',
      details: {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      }
    });
  }
});
router.post('/payment/calculate-breakdown', authMiddleware, PaymentController.calculatePaymentBreakdown);
router.post('/payment/validate-category', authMiddleware, PaymentController.validateCategoryData);
router.post('/payment/webhook', PaymentController.handleWebhook);

router.get('/available', authMiddleware, availableAdsController.getAvailableAds);
router.post('/assign', authMiddleware, availableAdsController.assignAdToCategoryWithPayment);

router.all('/payment/*', (req, res) => {
  console.log('=== UNMATCHED PAYMENT ROUTE ===');
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('Path:', req.path);
  
  res.status(404).json({ 
    error: 'Payment route not found',
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    availableRoutes: [
      'GET/POST /api/web-advertise/payment/test',
      'GET /api/web-advertise/payment/debug',
      'POST /api/web-advertise/payment/verify-with-refund',
      'POST /api/web-advertise/payment/verify-non-transactional',
      'POST /api/web-advertise/payment/initiate-with-refund',
      'POST /api/web-advertise/payment/process-wallet',
      'POST /api/web-advertise/payment/calculate-breakdown',
      'POST /api/web-advertise/payment/validate-category',
      'POST /api/web-advertise/payment/webhook'
    ]
  });
});

module.exports = router;