// PaymentController.js
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
const User = require('../../models/User');
const Payment = require('../models/PaymentModel');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/WalletModel');
const mongoose = require('mongoose');

const flw = new Flutterwave(process.env.FLW_TEST_PUBLIC_KEY, process.env.FLW_TEST_SECRET_KEY);

const retryTransaction = async (operation, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    
    try {
      const result = await session.withTransaction(operation, {
        readConcern: { level: "majority" },
        writeConcern: { w: "majority", j: true },
        readPreference: 'primary',
        maxCommitTimeMS: 30000 // 30 seconds timeout
      });
      
      await session.endSession();
      return result;
      
    } catch (error) {
      await session.endSession();
      
      // Check if it's a transient transaction error that can be retried
      if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError') && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Transaction failed (attempt ${attempt}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
};

exports.initiatePayment = async (req, res) => {
  try {
    const { adId, websiteId, categoryId } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    // Get ad and category details
    const ad = await ImportAd.findById(adId);
    const category = await AdCategory.findById(categoryId).populate('websiteId');
    const website = await Website.findById(websiteId);

    if (!ad || !category || !website) {
      return res.status(404).json({ error: 'Ad, category, or website not found' });
    }

    // Verify the ad belongs to the user
    if (ad.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to ad' });
    }

    // Check if this combination is already paid
    const existingSelection = ad.websiteSelections.find(
      sel => sel.websiteId.toString() === websiteId && 
             sel.categories.includes(categoryId) &&
             ['paid', 'active'].includes(sel.status)
    );

    if (existingSelection) {
      return res.status(400).json({ error: 'This ad space is already paid for' });
    }

    const amount = category.price;
    const tx_ref = `ad_${adId}_${websiteId}_${categoryId}_${Date.now()}`;
    
    const paymentData = {
      tx_ref: tx_ref,
      amount: amount,
      currency: 'USD',
      redirect_url: `${process.env.FRONTEND_URL}/payment/callback`,
      customer: {
        email: ad.adOwnerEmail,
        name: ad.businessName
      },
      customizations: {
        title: `Advertisement on ${website.websiteName}`,
        description: `Payment for ad space: ${category.categoryName}`,
        logo: process.env.LOGO_URL || ""
      },
      meta: {
        adId: adId,
        websiteId: websiteId,
        categoryId: categoryId,
        webOwnerId: website.ownerId,
        advertiserId: userId
      }
    };

    // Direct API call to Flutterwave
    const apiResponse = await axios.post('https://api.flutterwave.com/v3/payments', paymentData, {
      headers: {
        'Authorization': `Bearer ${process.env.FLW_TEST_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const response = {
      status: apiResponse.data.status,
      data: apiResponse.data.data
    };

    if (response.status === 'success') {
      // Create payment record with both tx_ref and temporary paymentId
      const payment = new Payment({
        paymentId: tx_ref, // Will be updated with actual transaction ID after verification
        tx_ref: tx_ref, // Store the transaction reference
        adId: adId,
        advertiserId: userId,
        webOwnerId: website.ownerId,
        websiteId: websiteId,
        categoryId: categoryId,
        amount: amount,
        status: 'pending',
        flutterwaveData: response.data
      });

      await payment.save();

      res.status(200).json({
        success: true,
        paymentUrl: response.data.link,
        paymentId: payment._id,
        tx_ref: tx_ref
      });
    } else {
      res.status(400).json({ error: 'Payment initiation failed', details: response });
    }

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { transaction_id, tx_ref } = req.body;
    
    // Use tx_ref if transaction_id is not provided
    const identifier = transaction_id || tx_ref;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Transaction ID or reference required' });
    }

    // Verify with Flutterwave first (outside transaction)
    const response = await flw.Transaction.verify({ id: identifier });

    if (response.status === 'success' && response.data.status === 'successful') {
      // Find payment by tx_ref first, then by paymentId (outside transaction)
      let payment = await Payment.findOne({ 
        $or: [
          { tx_ref: response.data.tx_ref },
          { paymentId: identifier }
        ]
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
      }

      // Check if already processed
      if (payment.status === 'successful') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: payment 
        });
      }

      // Execute the database operations with retry logic
      const result = await retryTransaction(async (session) => {
        // Re-fetch payment within transaction to avoid stale data
        const currentPayment = await Payment.findById(payment._id).session(session);
        
        if (!currentPayment) {
          throw new Error('Payment not found during transaction');
        }

        // Double-check status within transaction
        if (currentPayment.status === 'successful') {
          return { alreadyProcessed: true, payment: currentPayment };
        }

        // Update payment with actual Flutterwave transaction ID
        currentPayment.paymentId = response.data.id;
        currentPayment.status = 'successful';
        currentPayment.paidAt = new Date();
        currentPayment.flutterwaveData.set('verification', response.data);
        await currentPayment.save({ session });

        // Get required data
        const ad = await ImportAd.findById(currentPayment.adId).session(session);
        const website = await Website.findById(currentPayment.websiteId).session(session);
        const category = await AdCategory.findById(currentPayment.categoryId).session(session);

        if (!ad || !website || !category) {
          throw new Error('Required documents not found');
        }

        // Handle advertiser wallet
        const advertiser = await User.findById(currentPayment.advertiserId).session(session);
        if (!advertiser) {
          throw new Error('Advertiser not found');
        }

        await Wallet.findOneAndUpdate(
          { ownerId: currentPayment.advertiserId, ownerType: 'advertiser' },
          {
            $inc: { totalSpent: currentPayment.amount },
            $setOnInsert: {
              ownerId: currentPayment.advertiserId,
              ownerEmail: advertiser.email,
              ownerType: 'advertiser',
              balance: 0,
              totalEarned: 0,
              totalRefunded: 0
            },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true, session }
        );

        // Update ad website selection
        const selectionIndex = ad.websiteSelections.findIndex(
          sel => sel.websiteId.toString() === currentPayment.websiteId.toString() &&
                 sel.categories.includes(currentPayment.categoryId)
        );

        const rejectionDeadline = new Date();
        rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

        if (selectionIndex !== -1) {
          ad.websiteSelections[selectionIndex].status = 'active';
          ad.websiteSelections[selectionIndex].approved = true;
          ad.websiteSelections[selectionIndex].approvedAt = new Date();
          ad.websiteSelections[selectionIndex].publishedAt = new Date();
          ad.websiteSelections[selectionIndex].paymentId = currentPayment._id;
          ad.websiteSelections[selectionIndex].rejectionDeadline = rejectionDeadline;
        } else {
          ad.websiteSelections.push({
            websiteId: currentPayment.websiteId,
            categories: [currentPayment.categoryId],
            approved: true,
            approvedAt: new Date(),
            publishedAt: new Date(),
            paymentId: currentPayment._id,
            status: 'active',
            rejectionDeadline: rejectionDeadline
          });
        }

        // Check if all selections are approved
        const allApproved = ad.websiteSelections.every(sel => sel.approved);
        if (allApproved) {
          ad.confirmed = true;
        }

        await ad.save({ session });

        // Add ad to category's selectedAds (use $addToSet to avoid duplicates)
        await AdCategory.findByIdAndUpdate(
          currentPayment.categoryId,
          { $addToSet: { selectedAds: currentPayment.adId } },
          { session }
        );

        // Handle web owner wallet with proper email fallback
        const ownerEmail = category.webOwnerEmail || website.ownerEmail;
        if (!ownerEmail) {
          // Try to get owner email from user collection
          const webOwner = await User.findById(currentPayment.webOwnerId).session(session);
          if (!webOwner) {
            throw new Error('Website owner information not found');
          }
          ownerEmail = webOwner.email;
        }

        // Update web owner wallet
        const webOwnerWallet = await Wallet.findOneAndUpdate(
          { ownerId: currentPayment.webOwnerId, ownerType: 'webOwner' },
          {
            $inc: { 
              balance: currentPayment.amount,
              totalEarned: currentPayment.amount
            },
            $setOnInsert: {
              ownerId: currentPayment.webOwnerId,
              ownerEmail: ownerEmail,
              ownerType: 'webOwner',
              totalSpent: 0,
              totalRefunded: 0
            },
            $set: { lastUpdated: new Date() }
          },
          {
            upsert: true,
            new: true,
            session
          }
        );

        // Create wallet transaction
        const walletTransaction = new WalletTransaction({
          walletId: webOwnerWallet._id,
          paymentId: currentPayment._id,
          adId: currentPayment.adId,
          amount: currentPayment.amount,
          type: 'credit',
          description: `Payment for ad: ${ad.businessName} on category: ${category.categoryName}`
        });

        await walletTransaction.save({ session });

        return { success: true, payment: currentPayment };
      });

      // Handle the result
      if (result.alreadyProcessed) {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: result.payment 
        });
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified and ad published successfully',
        payment: result.payment
      });

    } else {
      // Payment failed - update status (no transaction needed for this)
      await Payment.findOneAndUpdate(
        { 
          $or: [
            { tx_ref: identifier },
            { paymentId: identifier },
            { tx_ref: response.data?.tx_ref }
          ]
        },
        { 
          status: 'failed',
          flutterwaveData: response.data 
        }
      );

      res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed',
        details: response.data 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error.code === 251) { // NoSuchTransaction
      errorMessage = 'Transaction was aborted due to conflicts. Please try again.';
      statusCode = 409; // Conflict
    } else if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
      errorMessage = 'Temporary transaction error. Please try again.';
      statusCode = 503; // Service Temporarily Unavailable
    }
    
    res.status(statusCode).json({ 
      error: errorMessage, 
      message: error.message,
      retryable: error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')
    });
  }
};

exports.verifyPaymentNonTransactional = async (req, res) => {
  try {
    const { transaction_id, tx_ref } = req.body;
    const identifier = transaction_id || tx_ref;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Transaction ID or reference required' });
    }

    // Verify with Flutterwave
    const response = await flw.Transaction.verify({ id: identifier });

    if (response.status === 'success' && response.data.status === 'successful') {
      let payment = await Payment.findOne({ 
        $or: [
          { tx_ref: response.data.tx_ref },
          { paymentId: identifier }
        ]
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
      }

      if (payment.status === 'successful') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: payment 
        });
      }

      // Use a simple flag to prevent double processing
      const updateResult = await Payment.findByIdAndUpdate(
        payment._id,
        { 
          $set: {
            paymentId: response.data.id,
            status: 'successful',
            paidAt: new Date(),
            'flutterwaveData.verification': response.data
          }
        },
        { 
          new: true,
          runValidators: true
        }
      );

      if (!updateResult) {
        return res.status(404).json({ error: 'Payment update failed' });
      }

      // Execute other operations sequentially (less consistent but more reliable)
      try {
        // Update ad
        const ad = await ImportAd.findById(payment.adId);
        if (ad) {
          const selectionIndex = ad.websiteSelections.findIndex(
            sel => sel.websiteId.toString() === payment.websiteId.toString() &&
                   sel.categories.includes(payment.categoryId)
          );

          const rejectionDeadline = new Date();
          rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

          if (selectionIndex !== -1) {
            ad.websiteSelections[selectionIndex].status = 'active';
            ad.websiteSelections[selectionIndex].approved = true;
            ad.websiteSelections[selectionIndex].approvedAt = new Date();
            ad.websiteSelections[selectionIndex].publishedAt = new Date();
            ad.websiteSelections[selectionIndex].paymentId = payment._id;
            ad.websiteSelections[selectionIndex].rejectionDeadline = rejectionDeadline;
          } else {
            ad.websiteSelections.push({
              websiteId: payment.websiteId,
              categories: [payment.categoryId],
              approved: true,
              approvedAt: new Date(),
              publishedAt: new Date(),
              paymentId: payment._id,
              status: 'active',
              rejectionDeadline: rejectionDeadline
            });
          }

          const allApproved = ad.websiteSelections.every(sel => sel.approved);
          if (allApproved) {
            ad.confirmed = true;
          }

          await ad.save();
        }

        // Update category
        await AdCategory.findByIdAndUpdate(
          payment.categoryId,
          { $addToSet: { selectedAds: payment.adId } }
        );

        // Handle wallets
        const advertiser = await User.findById(payment.advertiserId);
        if (advertiser) {
          await Wallet.findOneAndUpdate(
            { ownerId: payment.advertiserId, ownerType: 'advertiser' },
            {
              $inc: { totalSpent: payment.amount },
              $setOnInsert: {
                ownerId: payment.advertiserId,
                ownerEmail: advertiser.email,
                ownerType: 'advertiser',
                balance: 0,
                totalEarned: 0,
                totalRefunded: 0
              },
              $set: { lastUpdated: new Date() }
            },
            { upsert: true }
          );
        }

        // Web owner wallet
        const category = await AdCategory.findById(payment.categoryId);
        const website = await Website.findById(payment.websiteId);
        
        let ownerEmail = category?.webOwnerEmail;
        if (!ownerEmail) {
          const webOwner = await User.findById(payment.webOwnerId);
          ownerEmail = webOwner?.email;
        }

        if (ownerEmail) {
          const webOwnerWallet = await Wallet.findOneAndUpdate(
            { ownerId: payment.webOwnerId, ownerType: 'webOwner' },
            {
              $inc: { 
                balance: payment.amount,
                totalEarned: payment.amount
              },
              $setOnInsert: {
                ownerId: payment.webOwnerId,
                ownerEmail: ownerEmail,
                ownerType: 'webOwner',
                totalSpent: 0,
                totalRefunded: 0
              },
              $set: { lastUpdated: new Date() }
            },
            { upsert: true, new: true }
          );

          // Create wallet transaction
          if (webOwnerWallet) {
            const walletTransaction = new WalletTransaction({
              walletId: webOwnerWallet._id,
              paymentId: payment._id,
              adId: payment.adId,
              amount: payment.amount,
              type: 'credit',
              description: `Payment for ad: ${ad?.businessName || 'Unknown'} on category: ${category?.categoryName || 'Unknown'}`
            });
            await walletTransaction.save();
          }
        }

      } catch (updateError) {
        console.error('Post-payment update error:', updateError);
        // Payment is still marked as successful, but some updates failed
        // You might want to implement a cleanup/retry mechanism here
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified and ad published successfully',
        payment: updateResult
      });

    } else {
      await Payment.findOneAndUpdate(
        { 
          $or: [
            { tx_ref: identifier },
            { paymentId: identifier },
            { tx_ref: response.data?.tx_ref }
          ]
        },
        { 
          status: 'failed',
          flutterwaveData: response.data 
        }
      );

      res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed',
        details: response.data 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.initiatePaymentWithRefund = async (req, res) => {
  try {
    const { 
      adId, 
      websiteId, 
      categoryId, 
      useRefundOnly = false, 
      expectedRefund = 0, 
      expectedPayment = 0,
      isReassignment = false
    } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    // Get ad and category details FIRST - before any payment processing
    const ad = await ImportAd.findById(adId);
    const category = await AdCategory.findById(categoryId).populate('websiteId');
    const website = await Website.findById(websiteId);

    if (!ad || !category || !website) {
      return res.status(404).json({ error: 'Ad, category, or website not found' });
    }

    // Verify the ad belongs to the user
    if (ad.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to ad' });
    }

    // Check if category is fully booked
    const maxAds = category.userCount || 10;
    const currentAdsCount = category.selectedAds ? category.selectedAds.length : 0;
    
    if (currentAdsCount >= maxAds) {
      return res.status(409).json({ 
        error: 'Category fully booked', 
        message: `This category is fully booked (${currentAdsCount}/${maxAds} slots filled). Please try another category or check back later.`,
        isFullyBooked: true
      });
    }

    // Block refund usage for reassignment
    if (isReassignment && (useRefundOnly || expectedRefund > 0)) {
      return res.status(400).json({
        error: 'Refunds not allowed for reassignment',
        message: 'Ad reassignment can only be paid with wallet balance or card payment. Refunds are not permitted for reassignment.',
        code: 'REFUND_NOT_ALLOWED_FOR_REASSIGNMENT'
      });
    }

    // Get wallet balance for reassignment or refund credits for new ads
    let availableBalance = 0;
    let balanceSource = '';
    
    if (isReassignment) {
      // For reassignment: Only use wallet balance
      const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
      availableBalance = wallet ? wallet.balance : 0;
      balanceSource = 'wallet';
      
      console.log('REASSIGNMENT PAYMENT:', {
        walletBalance: availableBalance,
        categoryPrice: category.price,
        canAffordFromWallet: availableBalance >= category.price
      });
      
      // Check if wallet has sufficient balance for reassignment
      if (availableBalance < category.price) {
        return res.status(400).json({
          error: 'Insufficient wallet balance for reassignment',
          message: `Reassignment requires ${category.price} but wallet only has ${availableBalance}. Please top up your wallet or use card payment.`,
          code: 'INSUFFICIENT_WALLET_BALANCE',
          required: category.price,
          available: availableBalance,
          shortfall: category.price - availableBalance
        });
      }
    } else {
      // For new ads: Can use refunds
      availableBalance = useRefundOnly ? await Payment.getAllAvailableRefunds(userId) : 0;
      balanceSource = 'refund';
    }
    
    // Handle wallet-only payments - FIXED: Always pass ad object
    if (balanceSource === 'wallet' && availableBalance >= category.price) {
      return await this.processWalletOnlyPayment(req, res, {
        adId,
        websiteId,
        categoryId,
        walletAmount: category.price,
        userId,
        ad, // ✅ ALWAYS pass the ad object
        category,
        website,
        isReassignment
      });
    } else if (balanceSource === 'refund' && useRefundOnly && availableBalance >= category.price) {
      return await this.processRefundOnlyPayment(req, res, {
        adId,
        websiteId,
        categoryId,
        refundToUse: Math.min(availableBalance, category.price),
        userId,
        ad, // ✅ ALWAYS pass the ad object
        category,
        website
      });
    }

    // Calculate payment breakdown
    let walletForThisCategory = 0;
    let refundForThisCategory = 0;
    let remainingAmount = category.price;

    if (isReassignment) {
      // For reassignment: Only use wallet balance
      const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
      const walletBalance = wallet ? wallet.balance : 0;
      
      walletForThisCategory = Math.min(walletBalance, category.price);
      remainingAmount = Math.max(0, category.price - walletForThisCategory);
      
      console.log('REASSIGNMENT PAYMENT CALCULATION:', {
        categoryPrice: category.price,
        walletBalance,
        walletForThisCategory,
        remainingAmount
      });
    } else {
      // For new ads: Can use refunds if explicitly requested
      if (useRefundOnly && expectedRefund > 0) {
        const availableRefunds = await Payment.getAllAvailableRefunds(userId);
        refundForThisCategory = Math.min(expectedRefund, availableRefunds, category.price);
        remainingAmount = Math.max(0, category.price - refundForThisCategory);
      }
    }

    // If no external payment needed - FIXED: Always pass ad object
    if (remainingAmount <= 0.01) {
      if (walletForThisCategory > 0) {
        return await this.processWalletOnlyPayment(req, res, {
          adId,
          websiteId,
          categoryId,
          walletAmount: walletForThisCategory,
          userId,
          ad, // ✅ ALWAYS pass the ad object
          category,
          website,
          isReassignment
        });
      } else if (refundForThisCategory > 0) {
        return await this.processRefundOnlyPayment(req, res, {
          adId,
          websiteId,
          categoryId,
          refundToUse: refundForThisCategory,
          userId,
          ad, // ✅ ALWAYS pass the ad object
          category,
          website
        });
      }
    }

    // Continue with Flutterwave payment for remaining amount...
    // (rest of the function remains the same)
    const tx_ref = `ad_${adId}_${websiteId}_${categoryId}_${Date.now()}`;
    
    const paymentData = {
      tx_ref: tx_ref,
      amount: remainingAmount,
      currency: 'USD',
      redirect_url: `${process.env.FRONTEND_URL}/payment/callback`,
      customer: {
        email: ad.adOwnerEmail,
        name: ad.businessName
      },
      customizations: {
        title: `Advertisement on ${website.websiteName}`,
        description: `Payment for ad space: ${category.categoryName}${walletForThisCategory > 0 ? ` (${walletForThisCategory} wallet balance applied)` : ''}${refundForThisCategory > 0 ? ` (${refundForThisCategory} refund applied)` : ''}${isReassignment ? ' (Reassignment)' : ''}`,
        logo: process.env.LOGO_URL || ""
      },
      meta: {
        adId: adId,
        websiteId: websiteId,
        categoryId: categoryId,
        webOwnerId: website.ownerId,
        advertiserId: userId,
        walletApplied: walletForThisCategory,
        refundApplied: refundForThisCategory,
        totalCost: category.price,
        isReassignment: isReassignment
      }
    };

    // Direct API call to Flutterwave
    const apiResponse = await axios.post('https://api.flutterwave.com/v3/payments', paymentData, {
      headers: {
        'Authorization': `Bearer ${process.env.FLW_TEST_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const response = {
      status: apiResponse.data.status,
      data: apiResponse.data.data
    };

    if (response.status === 'success') {
      // Create payment record
      const payment = new Payment({
        paymentId: tx_ref,
        tx_ref: tx_ref,
        adId: adId,
        advertiserId: userId,
        webOwnerId: website.ownerId,
        websiteId: websiteId,
        categoryId: categoryId,
        amount: category.price,
        currency: 'USD',
        status: 'pending',
        flutterwaveData: response.data,
        walletApplied: walletForThisCategory,
        refundApplied: refundForThisCategory,
        amountPaid: remainingAmount,
        paymentMethod: walletForThisCategory > 0 ? 'wallet_hybrid' : (refundForThisCategory > 0 ? 'refund_hybrid' : 'flutterwave'),
        isReassignment: isReassignment,
        notes: isReassignment ? 'Ad reassignment payment' : undefined
      });

      await payment.save();

      res.status(200).json({
        success: true,
        paymentUrl: response.data.link,
        paymentId: payment._id,
        tx_ref: tx_ref,
        walletApplied: walletForThisCategory,
        refundApplied: refundForThisCategory,
        amountPaid: remainingAmount,
        totalCost: category.price,
        isReassignment: isReassignment,
        paymentMethod: payment.paymentMethod
      });
    } else {
      res.status(400).json({ error: 'Payment initiation failed', details: response });
    }
    
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// Helper function to generate unique transaction reference
const generateUniqueTransactionRef = (prefix, userId, additionalData = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const hash = require('crypto').createHash('md5')
    .update(`${userId}_${additionalData}_${timestamp}_${random}`)
    .digest('hex')
    .substring(0, 8);
  
  return `${prefix}_${userId}_${hash}_${timestamp}`;
};

exports.handleProcessWallet = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { selections, isReassignment = false } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('=== HANDLE PROCESS WALLET ===');
    console.log('Selections received:', selections);
    console.log('User ID:', userId);
    console.log('Is Reassignment:', isReassignment);

    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'No selections provided' });
    }

    // Get wallet balance
    const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
    const walletBalance = wallet ? wallet.balance : 0;
    
    // Calculate total cost and validate all selections first
    let totalCost = 0;
    const processedSelections = [];

    for (const selection of selections) {
      console.log('Validating selection:', selection);

      const ad = await ImportAd.findById(selection.adId);
      const category = await AdCategory.findById(selection.categoryId);
      const website = await Website.findById(selection.websiteId);

      if (!ad) {
        return res.status(404).json({ 
          error: 'Ad not found', 
          adId: selection.adId 
        });
      }
      
      if (!category) {
        return res.status(404).json({ 
          error: 'Category not found', 
          categoryId: selection.categoryId 
        });
      }
      
      if (!website) {
        return res.status(404).json({ 
          error: 'Website not found', 
          websiteId: selection.websiteId 
        });
      }

      // Verify ad ownership
      if (ad.userId !== userId) {
        return res.status(403).json({ 
          error: 'Unauthorized access to ad',
          adId: selection.adId 
        });
      }

      // Check if category is fully booked
      const maxAds = category.userCount || 10;
      const currentAdsCount = category.selectedAds ? category.selectedAds.length : 0;
      
      if (currentAdsCount >= maxAds) {
        return res.status(409).json({ 
          error: 'Category fully booked', 
          message: `Category "${category.categoryName}" is fully booked (${currentAdsCount}/${maxAds} slots filled).`,
          categoryName: category.categoryName
        });
      }

      const price = parseFloat(category.price) || 0;
      totalCost += price;
      
      processedSelections.push({
        ...selection,
        ad,
        category,
        website,
        price
      });
    }

    console.log('Total cost:', totalCost);
    console.log('Wallet balance:', walletBalance);

    // Determine payment strategy
    if (walletBalance >= totalCost) {
      // Full wallet payment
      console.log('Processing full wallet payment');
      
      const results = [];
      
      await session.withTransaction(async () => {
        for (let i = 0; i < processedSelections.length; i++) {
          const selection = processedSelections[i];
          
          console.log(`Processing wallet payment ${i + 1}/${processedSelections.length} for category: ${selection.category.categoryName}`);

          // Generate unique tx_ref for each selection
          const uniqueTxRef = generateUniqueTransactionRef(
            'wallet',
            userId,
            `${selection.adId}_${selection.categoryId}_${i}`
          );

          const result = await this.processWalletPaymentInternal({
            adId: selection.adId,
            websiteId: selection.websiteId,
            categoryId: selection.categoryId,
            walletAmount: selection.price,
            userId: userId,
            ad: selection.ad,
            category: selection.category,
            website: selection.website,
            isReassignment: isReassignment,
            txRef: uniqueTxRef
          }, session);

          results.push({
            categoryName: selection.category.categoryName,
            websiteName: selection.website.websiteName,
            price: selection.price,
            ...result
          });
        }
      });

      // All payments successful
      res.status(200).json({
        success: true,
        allPaid: true,
        message: `Successfully paid for ${processedSelections.length} categories using wallet balance${isReassignment ? ' (Reassignment)' : ''}`,
        summary: {
          message: `Successfully paid for ${processedSelections.length} categories using wallet balance${isReassignment ? ' (Reassignment)' : ''}`,
          totalCost: totalCost,
          walletUsed: totalCost,
          cardAmount: 0,
          isReassignment: isReassignment
        },
        results: results
      });

    } else {
      // Hybrid payment (wallet + card)
      console.log('Processing hybrid payment (wallet + card)');
      
      const walletToUse = Math.min(walletBalance, totalCost);
      const remainingAmount = totalCost - walletToUse;
      
      console.log('HYBRID PAYMENT CALCULATION:', {
        totalCost,
        walletToUse,
        remainingAmount,
        isReassignment
      });

      // Generate unique transaction reference for hybrid payment
      const hybridTxRef = generateUniqueTransactionRef(
        'hybrid',
        userId,
        `${selections.length}_selections_${totalCost}`
      );

      // Create payment record for card processing
      const paymentData = {
        userId,
        tx_ref: hybridTxRef,
        amount: remainingAmount,
        walletAmount: walletToUse,
        totalAmount: totalCost,
        selections: processedSelections.map(s => ({
          adId: s.adId,
          websiteId: s.websiteId,
          categoryId: s.categoryId,
          price: s.price
        })),
        isReassignment,
        status: 'pending',
        paymentType: 'hybrid'
      };

      // Save payment record (assuming you have a Payment model)
      // const payment = new Payment(paymentData);
      // await payment.save();

      // Generate Flutterwave payment URL
      const paymentUrl = await this.generateFlutterwavePaymentUrl({
        amount: remainingAmount,
        tx_ref: hybridTxRef,
        customer: {
          email: req.user.email,
          name: req.user.name || 'User'
        },
        customizations: {
          title: `Ad Category Payment${isReassignment ? ' (Reassignment)' : ''}`,
          description: `Payment for ${processedSelections.length} categories`
        }
      });

      res.status(200).json({
        success: true,
        allPaid: false,
        message: `Partial payment processed. ${walletToUse.toFixed(2)} deducted from wallet. Complete payment of ${remainingAmount.toFixed(2)} via card.`,
        summary: {
          message: `Partial payment processed. ${walletToUse.toFixed(2)} deducted from wallet. Complete payment of ${remainingAmount.toFixed(2)} via card.`,
          totalCost: totalCost,
          walletUsed: walletToUse,
          cardAmount: remainingAmount,
          isReassignment: isReassignment
        },
        paymentUrl: paymentUrl,
        tx_ref: hybridTxRef
      });
    }

  } catch (error) {
    console.error('Handle process wallet error:', error);
    
    let errorMessage = 'Wallet payment failed';
    let statusCode = 500;
    
    if (error.code === 11000 && error.keyPattern && error.keyPattern.tx_ref) {
      errorMessage = 'Transaction reference conflict. Please try again.';
      statusCode = 409;
    } else if (error.message.includes('Insufficient wallet balance')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      errorMessage = error.message;
      statusCode = 404;
    } else if (error.message.includes('Unauthorized')) {
      errorMessage = error.message;
      statusCode = 403;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage, 
      message: error.message
    });
  } finally {
    await session.endSession();
  }
};

// Internal wallet payment processing method
exports.processWalletPaymentInternal = async (data, session = null) => {
  try {
    const {
      adId,
      websiteId,
      categoryId,
      walletAmount,
      userId,
      ad,
      category,
      website,
      isReassignment,
      txRef
    } = data;

    // Use provided transaction reference or generate new one
    const transactionRef = txRef || generateUniqueTransactionRef(
      'wallet_internal',
      userId,
      `${adId}_${categoryId}`
    );

    // Update wallet balance
    const wallet = await Wallet.findOneAndUpdate(
      { ownerId: userId, ownerType: 'advertiser' },
      { 
        $inc: { 
          balance: -walletAmount,
          totalSpent: walletAmount
        },
        lastUpdated: new Date()
      },
      { session, new: true }
    );

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Create payment record (if you have a Payment model)
    // const payment = new Payment({
    //   userId,
    //   tx_ref: transactionRef,
    //   amount: walletAmount,
    //   paymentType: 'wallet',
    //   status: 'completed',
    //   adId,
    //   websiteId,
    //   categoryId,
    //   isReassignment
    // });
    // await payment.save({ session });

    // Update ad's website selection
    const updatedAd = await ImportAd.findOneAndUpdate(
      { 
        _id: adId,
        'websiteSelections.websiteId': websiteId,
        'websiteSelections.categories': categoryId
      },
      {
        $set: {
          'websiteSelections.$.approved': true,
          'websiteSelections.$.approvedAt': new Date(),
          'websiteSelections.$.status': 'active',
          'websiteSelections.$.publishedAt': new Date()
        }
      },
      { session, new: true }
    );

    // Update category selected ads
    await AdCategory.findByIdAndUpdate(
      categoryId,
      { $addToSet: { selectedAds: adId } },
      { session }
    );

    // Update website owner's wallet
    await Wallet.findOneAndUpdate(
      { ownerId: category.ownerId, ownerType: 'webOwner' },
      { 
        $inc: { 
          balance: walletAmount,
          totalEarned: walletAmount
        },
        lastUpdated: new Date()
      },
      { session, upsert: true }
    );

    return {
      success: true,
      transactionRef,
      walletBalance: wallet.balance
    };

  } catch (error) {
    console.error('Internal wallet payment error:', error);
    throw error;
  }
};

// Helper method to generate Flutterwave payment URL
exports.generateFlutterwavePaymentUrl = async (paymentData) => {
  try {
    // Check if Flutterwave secret key is configured
    const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_TEST_SECRET_KEY;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    if (!flutterwaveSecretKey) {
      console.error('Neither FLUTTERWAVE_SECRET_KEY nor FLW_TEST_SECRET_KEY environment variable is set');
      throw new Error('Payment service configuration missing. Please contact support.');
    }

    // Detect if we're in test mode
    const isTestMode = flutterwaveSecretKey.includes('TEST') || flutterwaveSecretKey.startsWith('FLWSECK_TEST');
    console.log(`Using Flutterwave in ${isTestMode ? 'TEST' : 'LIVE'} mode`);

    console.log('Generating Flutterwave payment with:', {
      tx_ref: paymentData.tx_ref,
      amount: paymentData.amount,
      redirect_url: `${frontendUrl}/payment-callback`,
      hasSecretKey: !!flutterwaveSecretKey
    });

    const flutterwaveResponse = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      {
        tx_ref: paymentData.tx_ref,
        amount: paymentData.amount,
        currency: 'USD', // or your preferred currency
        redirect_url: `${frontendUrl}/payment-callback`,
        customer: paymentData.customer,
        customizations: paymentData.customizations
      },
      {
        headers: {
          'Authorization': `Bearer ${flutterwaveSecretKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Flutterwave response status:', flutterwaveResponse.data.status);

    if (flutterwaveResponse.data.status === 'success') {
      return flutterwaveResponse.data.data.link;
    } else {
      console.error('Flutterwave API error:', flutterwaveResponse.data);
      throw new Error(`Flutterwave API error: ${flutterwaveResponse.data.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Flutterwave payment URL generation error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('Payment service authentication failed. Please contact support.');
    } else if (error.response?.status === 400) {
      throw new Error('Invalid payment data. Please check your information and try again.');
    } else if (error.message.includes('configuration missing')) {
      throw error; // Re-throw configuration errors as-is
    } else {
      throw new Error('Payment URL generation failed. Please try again later.');
    }
  }
};

exports.calculatePaymentBreakdown = async (req, res) => {
  try {
    const { selections, isReassignment = false } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'No selections provided' });
    }

    // Get wallet balance 
    const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
    const walletBalance = wallet ? wallet.balance : 0;
    
    // Only get refund credits if NOT reassignment
    const availableRefunds = isReassignment ? 0 : await Payment.getAllAvailableRefunds(userId);
    
    let totalCost = 0;
    const categoryDetails = [];

    // Get all category details and calculate total cost
    for (const selection of selections) {
      const category = await AdCategory.findById(selection.categoryId);
      const website = await Website.findById(selection.websiteId);
      
      if (category && website) {
        const price = parseFloat(category.price) || 0;
        totalCost += price;
        categoryDetails.push({
          ...selection,
          price: price,
          categoryName: category.categoryName,
          websiteName: website.websiteName
        });
      }
    }

    console.log('=== PAYMENT CALCULATION ===');
    console.log('Total Cost:', totalCost);
    console.log('Wallet Balance:', walletBalance);
    console.log('Available Refunds:', availableRefunds);
    console.log('Is Reassignment:', isReassignment);

    // Different logic for reassignment vs new ads
    let paidFromWallet = 0;
    let paidFromRefunds = 0;
    let needsExternalPayment = 0;

    if (isReassignment) {
      // REASSIGNMENT: Only wallet + external payment
      if (walletBalance >= totalCost) {
        paidFromWallet = totalCost;
      } else {
        paidFromWallet = walletBalance;
        needsExternalPayment = totalCost - walletBalance;
      }
      paidFromRefunds = 0;
    } else {
      // NEW ADS: Wallet first, then refunds, then external payment
      if (walletBalance >= totalCost) {
        paidFromWallet = totalCost;
      } else {
        paidFromWallet = walletBalance;
        const remaining = totalCost - walletBalance;
        
        if (availableRefunds >= remaining) {
          paidFromRefunds = remaining;
        } else {
          paidFromRefunds = availableRefunds;
          needsExternalPayment = remaining - availableRefunds;
        }
      }
    }

    // Create breakdown for each category
    let remainingWallet = paidFromWallet;
    let remainingRefunds = paidFromRefunds;
    let remainingExternal = needsExternalPayment;
    
    const breakdown = categoryDetails.map(cat => {
      let walletUsed = 0;
      let refundUsed = 0;
      let externalNeeded = 0;
      
      if (remainingWallet >= cat.price) {
        walletUsed = cat.price;
        remainingWallet -= cat.price;
      } else if (remainingWallet > 0) {
        walletUsed = remainingWallet;
        const stillNeeded = cat.price - remainingWallet;
        remainingWallet = 0;
        
        if (!isReassignment && remainingRefunds >= stillNeeded) {
          refundUsed = stillNeeded;
          remainingRefunds -= stillNeeded;
        } else if (!isReassignment && remainingRefunds > 0) {
          refundUsed = remainingRefunds;
          externalNeeded = stillNeeded - remainingRefunds;
          remainingRefunds = 0;
          remainingExternal -= externalNeeded;
        } else {
          externalNeeded = stillNeeded;
          remainingExternal -= externalNeeded;
        }
      } else if (!isReassignment && remainingRefunds >= cat.price) {
        refundUsed = cat.price;
        remainingRefunds -= cat.price;
      } else if (!isReassignment && remainingRefunds > 0) {
        refundUsed = remainingRefunds;
        externalNeeded = cat.price - remainingRefunds;
        remainingRefunds = 0;
        remainingExternal -= externalNeeded;
      } else {
        externalNeeded = cat.price;
        remainingExternal -= externalNeeded;
      }
      
      return {
        ...cat,
        walletUsed,
        refundUsed,
        externalPayment: externalNeeded,
        paymentMethod: externalNeeded > 0 ? 'external' : (refundUsed > 0 ? 'refund_or_wallet' : 'wallet')
      };
    });

    res.status(200).json({
      success: true,
      breakdown: breakdown,
      summary: {
        totalCost,
        walletBalance,
        availableRefunds,
        paidFromWallet,
        paidFromRefunds,
        needsExternalPayment,
        canAffordAll: needsExternalPayment === 0,
        isReassignment: isReassignment,
        paymentRestrictions: isReassignment ? 'Wallet and card payments only (no refunds)' : 'All payment methods available'
      }
    });

  } catch (error) {
    console.error('Payment breakdown calculation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.completeAdPlacement = async (adId, websiteId, categoryId, paymentId, session) => {
  const ad = await ImportAd.findById(adId).session(session);
  const category = await AdCategory.findById(categoryId).session(session);
  const website = await Website.findById(websiteId).session(session);
  
  // Update ad selections
  const selectionIndex = ad.websiteSelections.findIndex(
    sel => sel.websiteId.toString() === websiteId && sel.categories.includes(categoryId)
  );

  const rejectionDeadline = new Date();
  rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

  if (selectionIndex !== -1) {
    ad.websiteSelections[selectionIndex].status = 'active';
    ad.websiteSelections[selectionIndex].approved = true;
    ad.websiteSelections[selectionIndex].approvedAt = new Date();
    ad.websiteSelections[selectionIndex].publishedAt = new Date();
    ad.websiteSelections[selectionIndex].paymentId = paymentId;
    ad.websiteSelections[selectionIndex].rejectionDeadline = rejectionDeadline;
    ad.websiteSelections[selectionIndex].isRejected = false;
  } else {
    ad.websiteSelections.push({
      websiteId: websiteId,
      categories: [categoryId],
      approved: true,
      approvedAt: new Date(),
      publishedAt: new Date(),
      paymentId: paymentId,
      status: 'active',
      rejectionDeadline: rejectionDeadline,
      isRejected: false
    });
  }

  ad.availableForReassignment = false;
  await ad.save({ session });

  // Add ad to category
  await AdCategory.findByIdAndUpdate(
    categoryId,
    { $addToSet: { selectedAds: adId } },
    { session }
  );

  // Update web owner wallet
  let webOwnerWallet = await Wallet.findOne({ 
    ownerId: website.ownerId, 
    ownerType: 'webOwner' 
  }).session(session);
  
  if (!webOwnerWallet) {
    webOwnerWallet = new Wallet({
      ownerId: website.ownerId,
      ownerEmail: category.webOwnerEmail,
      ownerType: 'webOwner',
      balance: 0,
      totalEarned: 0
    });
  }

  webOwnerWallet.balance += category.price;
  webOwnerWallet.totalEarned += category.price;
  webOwnerWallet.lastUpdated = new Date();
  await webOwnerWallet.save({ session });

  // Create wallet transaction
  const walletTransaction = new WalletTransaction({
    walletId: webOwnerWallet._id,
    paymentId: paymentId,
    adId: adId,
    amount: category.price,
    type: 'credit',
    description: `Payment for ad: ${ad.businessName} on category: ${category.categoryName}`
  });

  await walletTransaction.save({ session });
};

exports.verifyPaymentWithRefund = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { transaction_id, tx_ref } = req.body;
    
    const identifier = transaction_id || tx_ref;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Transaction ID or reference required' });
    }

    // Verify with Flutterwave
    const response = await flw.Transaction.verify({ id: identifier });

    if (response.status === 'success' && response.data.status === 'successful') {
      // Find payment by tx_ref first, then by paymentId
      let payment = await Payment.findOne({ 
        $or: [
          { tx_ref: response.data.tx_ref },
          { paymentId: identifier }
        ]
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
      }

      if (payment.status === 'successful') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: payment 
        });
      }

      // Execute transaction
      await session.withTransaction(async () => {
        // Update payment with actual Flutterwave transaction ID
        payment.paymentId = response.data.id;
        payment.status = 'successful';
        payment.paidAt = new Date();
        payment.flutterwaveData.set('verification', response.data);
        await payment.save({ session });

        // If refund was applied, mark the refunds as used (FIFO)
        if (payment.refundApplied && payment.refundApplied > 0) {
          const refundPayments = await Payment.find({
            advertiserId: payment.advertiserId,
            status: 'refunded',
            refundUsed: { $ne: true }
          }).sort({ refundedAt: 1 }).session(session);

          let remainingRefundToApply = payment.refundApplied;
          
          for (const refundPayment of refundPayments) {
            if (remainingRefundToApply <= 0) break;
            
            const refundAmountToUse = Math.min(remainingRefundToApply, refundPayment.amount);
            
            refundPayment.refundUsed = true;
            refundPayment.refundUsedAt = new Date();
            refundPayment.refundUsedForPayment = payment._id; // Use ObjectId instead of string
            await refundPayment.save({ session });
            
            remainingRefundToApply -= refundAmountToUse;
          }
        }

        // Update ad website selection
        const ad = await ImportAd.findById(payment.adId).session(session);
        const selectionIndex = ad.websiteSelections.findIndex(
          sel => sel.websiteId.toString() === payment.websiteId.toString() &&
                 sel.categories.includes(payment.categoryId)
        );

        const rejectionDeadline = new Date();
        rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

        if (selectionIndex !== -1) {
          ad.websiteSelections[selectionIndex].status = 'active';
          ad.websiteSelections[selectionIndex].approved = true;
          ad.websiteSelections[selectionIndex].approvedAt = new Date();
          ad.websiteSelections[selectionIndex].publishedAt = new Date();
          ad.websiteSelections[selectionIndex].paymentId = payment._id;
          ad.websiteSelections[selectionIndex].rejectionDeadline = rejectionDeadline;
          ad.websiteSelections[selectionIndex].isRejected = false;
        } else {
          ad.websiteSelections.push({
            websiteId: payment.websiteId,
            categories: [payment.categoryId],
            approved: true,
            approvedAt: new Date(),
            publishedAt: new Date(),
            paymentId: payment._id,
            status: 'active',
            rejectionDeadline: rejectionDeadline,
            isRejected: false
          });
        }

        ad.availableForReassignment = false;
        await ad.save({ session });

        // Add ad to category's selectedAds
        await AdCategory.findByIdAndUpdate(
          payment.categoryId,
          { $addToSet: { selectedAds: payment.adId } },
          { session }
        );

        // Update or create wallet for web owner
        let wallet = await Wallet.findOne({ 
          ownerId: payment.webOwnerId, 
          ownerType: 'webOwner' 
        }).session(session);
        
        if (!wallet) {
          const website = await Website.findById(payment.websiteId).session(session);
          const category = await AdCategory.findById(payment.categoryId).session(session);
          const ownerEmail = category.webOwnerEmail;
          
          if (!ownerEmail) {
            throw new Error('Website owner email not found');
          }
          
          wallet = new Wallet({
            ownerId: payment.webOwnerId,
            ownerEmail: ownerEmail,
            ownerType: 'webOwner',
            balance: 0,
            totalEarned: 0
          });
        }

        wallet.balance += payment.amount;
        wallet.totalEarned += payment.amount;
        wallet.lastUpdated = new Date();
        await wallet.save({ session });

        // Create wallet transaction
        const walletTransaction = new WalletTransaction({
          walletId: wallet._id,
          paymentId: payment._id,
          adId: payment.adId,
          amount: payment.amount,
          type: 'credit',
          description: `Payment for ad: ${ad.businessName} on category: ${payment.categoryId}${payment.refundApplied ? ` (Refund applied: ${payment.refundApplied})` : ''}`
        });

        await walletTransaction.save({ session });
      });

      res.status(200).json({
        success: true,
        message: 'Payment verified and ad published successfully',
        payment: payment,
        refundApplied: payment.refundApplied || 0,
        rejectionDeadline: Date.now() + (2 * 60 * 1000)
      });

    } else {
      // Payment failed
      await Payment.findOneAndUpdate(
        { 
          $or: [
            { tx_ref: identifier },
            { paymentId: identifier },
            { tx_ref: response.data?.tx_ref }
          ]
        },
        { 
          status: 'failed',
          flutterwaveData: response.data 
        }
      );

      res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed',
        details: response.data 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  } finally {
    await session.endSession();
  }
};

exports.validateCategoryData = async (req, res) => {
  try {
    const { categoryId, websiteId } = req.body;
    
    const [category, website] = await Promise.all([
      AdCategory.findById(categoryId),
      Website.findById(websiteId)
    ]);

    if (!category) {
      return res.status(404).json({ 
        error: 'Category not found', 
        categoryId: categoryId 
      });
    }

    if (!website) {
      return res.status(404).json({ 
        error: 'Website not found', 
        websiteId: websiteId 
      });
    }

    // Validate category has all required fields
    const validation = {
      isValid: true,
      errors: [],
      data: {
        categoryId: category._id,
        categoryName: category.categoryName,
        price: category.price,
        websiteId: website._id,
        websiteName: website.websiteName,
        maxAds: category.userCount || 10,
        currentAds: category.selectedAds?.length || 0
      }
    };

    if (!category.categoryName) {
      validation.isValid = false;
      validation.errors.push('Category name missing');
    }

    if (!category.price || category.price <= 0) {
      validation.isValid = false;
      validation.errors.push(`Invalid price: ${category.price}`);
    }

    if (!website.websiteName) {
      validation.isValid = false;
      validation.errors.push('Website name missing');
    }

    res.status(200).json(validation);

  } catch (error) {
    console.error('Category validation error:', error);
    res.status(500).json({ 
      error: 'Validation failed', 
      message: error.message 
    });
  }
};

exports.handleWebhook = async (req, res) => {
  try {
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers["verif-hash"];

    if (!signature || signature !== secretHash) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    const payload = req.body;

    if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
      // Process successful payment using transaction ID
      await this.verifyPayment({ 
        body: { 
          transaction_id: payload.data.id,
          tx_ref: payload.data.tx_ref 
        } 
      }, res);
    }

    res.status(200).json({ status: 'success' });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    const wallet = await Wallet.findOne({ 
      ownerId: userId, 
      ownerType: 'advertiser' 
    });
    
    const walletBalance = wallet ? wallet.balance : 0;
    
    res.status(200).json({
      success: true,
      walletBalance: walletBalance,
      hasWallet: !!wallet
    });
    
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.getRefundCredits = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    const availableRefunds = await Payment.getAllAvailableRefunds(userId);
    const refundBreakdown = await Payment.getRefundBreakdown(userId);
    
    res.status(200).json({
      success: true,
      totalAvailableRefunds: availableRefunds,
      refundDetails: refundBreakdown.refunds,
      refundCount: refundBreakdown.count
    });
    
  } catch (error) {
    console.error('Error fetching refund credits:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.getAdvertiserRefundBalance = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    const availableRefunds = await Payment.getAllAvailableRefunds(userId);
    const refundDetails = await Payment.find({
      advertiserId: userId,
      status: 'refunded',
      refundUsed: { $ne: true }
    }).populate('adId', 'businessName').sort({ refundedAt: -1 });

    res.status(200).json({
      success: true,
      totalAvailableRefunds: availableRefunds,
      refundCount: refundDetails.length,
      refundDetails: refundDetails.map(payment => ({
        paymentId: payment._id,
        amount: payment.amount,
        refundedAt: payment.refundedAt,
        refundReason: payment.refundReason,
        businessName: payment.adId?.businessName || 'Unknown Business'
      }))
    });

  } catch (error) {
    console.error('Error getting refund balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};