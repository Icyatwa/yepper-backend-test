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

exports.initiatePaymentWithRefund = async (req, res) => {
  try {
    const { adId, websiteId, categoryId, pendingCategoriesCount = 1 } = req.body;
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

    // FIXED: Get available refunds and calculate fair distribution
    const availableRefunds = await Payment.getAllAvailableRefunds(userId);
    
    // FIXED: Calculate refund per category based on pending categories count
    const refundPerCategory = pendingCategoriesCount > 1 ? 
      Math.min(availableRefunds / pendingCategoriesCount, category.price) : 
      Math.min(availableRefunds, category.price);
    
    const refundForThisCategory = Math.floor(refundPerCategory * 100) / 100; // Round down to cents
    const remainingAmount = Math.max(0, category.price - refundForThisCategory);

    console.log('PAYMENT CALCULATION:', {
      availableRefunds,
      pendingCategoriesCount,
      categoryPrice: category.price,
      refundPerCategory,
      refundForThisCategory,
      remainingAmount
    });

    // If refund covers the entire cost for this category
    if (remainingAmount <= 0.01 && refundForThisCategory > 0) {
      return await this.processRefundOnlyPayment(req, res, {
        adId,
        websiteId,
        categoryId,
        refundToUse: refundForThisCategory,
        userId,
        ad,
        category,
        website
      });
    }

    // If there's a remaining amount, initiate Flutterwave payment
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
        description: `Payment for ad space: ${category.categoryName}${refundForThisCategory > 0 ? ` ($${refundForThisCategory} refund applied)` : ''}`,
        logo: process.env.LOGO_URL || ""
      },
      meta: {
        adId: adId,
        websiteId: websiteId,
        categoryId: categoryId,
        webOwnerId: website.ownerId,
        advertiserId: userId,
        refundApplied: refundForThisCategory,
        totalCost: category.price
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
        amount: category.price, // Full amount
        currency: 'USD',
        status: 'pending',
        flutterwaveData: response.data,
        refundApplied: refundForThisCategory,
        amountPaid: remainingAmount, // Actual amount paid via Flutterwave
        paymentMethod: refundForThisCategory > 0 ? 'hybrid' : 'flutterwave'
      });

      await payment.save();

      res.status(200).json({
        success: true,
        paymentUrl: response.data.link,
        paymentId: payment._id,
        tx_ref: tx_ref,
        refundApplied: refundForThisCategory,
        amountPaid: remainingAmount,
        totalCost: category.price,
        availableRefunds: availableRefunds,
        isSmartRefundUsed: refundForThisCategory > 0
      });
    } else {
      res.status(400).json({ error: 'Payment initiation failed', details: response });
    }

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// Process payment using only refund (no external payment needed)
exports.processRefundOnlyPayment = async (req, res, paymentData) => {
  const session = await mongoose.startSession();
  
  try {
    const { adId, websiteId, categoryId, refundToUse, userId, ad, category, website } = paymentData;
    
    await session.withTransaction(async () => {
      // FIXED: Mark ONLY the required refund amount as used (FIFO)
      const refundPayments = await Payment.find({
        advertiserId: userId,
        status: 'refunded',
        refundUsed: { $ne: true }
      }).sort({ refundedAt: 1 }).session(session);

      let remainingRefundNeeded = refundToUse;
      const usedRefunds = [];

      for (const refundPayment of refundPayments) {
        if (remainingRefundNeeded <= 0) break;
        
        const refundAmount = Math.min(remainingRefundNeeded, refundPayment.amount);
        usedRefunds.push({
          paymentId: refundPayment._id,
          amount: refundAmount
        });
        
        // Mark as used (for simplicity, we'll mark the entire payment as used)
        // In production, you might want to implement partial usage tracking
        refundPayment.refundUsed = true;
        refundPayment.refundUsedAt = new Date();
        refundPayment.refundUsedForPayment = `refund_${adId}_${websiteId}_${categoryId}_${Date.now()}`;
        await refundPayment.save({ session });
        
        remainingRefundNeeded -= refundAmount;
      }

      // Create payment record
      const payment = new Payment({
        paymentId: `refund_${adId}_${websiteId}_${categoryId}_${Date.now()}`,
        tx_ref: `refund_${adId}_${websiteId}_${categoryId}_${Date.now()}`,
        adId: adId,
        advertiserId: userId,
        webOwnerId: website.ownerId,
        websiteId: websiteId,
        categoryId: categoryId,
        amount: category.price,
        currency: 'USD',
        status: 'successful',
        paidAt: new Date(),
        refundApplied: refundToUse,
        amountPaid: 0,
        paymentMethod: 'refund_only',
        notes: `Paid using refund credits: ${usedRefunds.map(r => `${r.amount.toFixed(2)}`).join(', ')}`
      });

      await payment.save({ session });

      // Update ad website selection with rejection deadline
      const selectionIndex = ad.websiteSelections.findIndex(
        sel => sel.websiteId.toString() === websiteId &&
               sel.categories.includes(categoryId)
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
          websiteId: websiteId,
          categories: [categoryId],
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
        paymentId: payment._id,
        adId: adId,
        amount: category.price,
        type: 'credit',
        description: `Refund-only payment for ad: ${ad.businessName} on category: ${category.categoryName}`
      });

      await walletTransaction.save({ session });
    });

    res.status(200).json({
      success: true,
      message: 'Payment completed using refund credits',
      paymentMethod: 'refund_only',
      refundUsed: refundToUse,
      rejectionDeadline: Date.now() + (2 * 60 * 1000)
    });

  } catch (error) {
    console.error('Refund-only payment error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  } finally {
    await session.endSession();
  }
};

// Enhanced verify payment that handles refund application
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
            refundPayment.refundUsedForPayment = payment._id;
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