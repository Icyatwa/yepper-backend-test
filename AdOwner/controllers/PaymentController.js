// PaymentController.js
const crypto = require('crypto');
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
const User = require('../../models/User');
const Payment = require('../models/PaymentModel');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/walletModel');
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

    // Get ad and category details FIRST
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

    // FIXED: Block ANY refund usage for reassignment
    if (isReassignment && (useRefundOnly || expectedRefund > 0)) {
      return res.status(400).json({
        error: 'Refunds not allowed for reassignment',
        message: 'Ad reassignment can only be paid with wallet balance or card payment. Refunds are not permitted for reassignment.',
        code: 'REFUND_NOT_ALLOWED_FOR_REASSIGNMENT'
      });
    }

    // FIXED: Get appropriate balance source based on reassignment flag
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
    
    // Handle wallet-only payments for reassignment
    if (balanceSource === 'wallet' && availableBalance >= category.price) {
      return await this.processWalletOnlyPayment(req, res, {
        adId,
        websiteId,
        categoryId,
        walletAmount: category.price,
        userId,
        ad,
        category,
        website,
        isReassignment: true // ENSURE reassignment flag is passed
      });
    } else if (balanceSource === 'refund' && useRefundOnly && availableBalance >= category.price) {
      // Only for NEW ads - not reassignment
      if (isReassignment) {
        return res.status(400).json({
          error: 'Refunds not allowed for reassignment',
          message: 'Cannot use refunds for ad reassignment',
          code: 'REFUND_NOT_ALLOWED_FOR_REASSIGNMENT'
        });
      }
      
      return await this.processRefundOnlyPayment(req, res, {
        adId,
        websiteId,
        categoryId,
        refundToUse: Math.min(availableBalance, category.price),
        userId,
        ad,
        category,
        website
      });
    }

    // FIXED: Calculate payment breakdown with reassignment logic
    let walletForThisCategory = 0;
    let refundForThisCategory = 0;
    let remainingAmount = category.price;

    if (isReassignment) {
      // For reassignment: Only use wallet balance - NO REFUNDS
      const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
      const walletBalance = wallet ? wallet.balance : 0;
      
      walletForThisCategory = Math.min(walletBalance, category.price);
      remainingAmount = Math.max(0, category.price - walletForThisCategory);
      refundForThisCategory = 0; // ALWAYS 0 for reassignment
      
      console.log('REASSIGNMENT PAYMENT CALCULATION:', {
        categoryPrice: category.price,
        walletBalance,
        walletForThisCategory,
        remainingAmount,
        refundForThisCategory: 0
      });
    } else {
      // For new ads: Can use refunds if explicitly requested
      if (useRefundOnly && expectedRefund > 0) {
        const availableRefunds = await Payment.getAllAvailableRefunds(userId);
        refundForThisCategory = Math.min(expectedRefund, availableRefunds, category.price);
        remainingAmount = Math.max(0, category.price - refundForThisCategory);
      }
    }

    // If no external payment needed
    if (remainingAmount <= 0.01) {
      if (walletForThisCategory > 0) {
        return await this.processWalletOnlyPayment(req, res, {
          adId,
          websiteId,
          categoryId,
          walletAmount: walletForThisCategory,
          userId,
          ad,
          category,
          website,
          isReassignment
        });
      } else if (refundForThisCategory > 0 && !isReassignment) {
        // Only for NEW ads
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
    }

    // Continue with Flutterwave payment for remaining amount
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
        description: `Payment for ad space: ${category.categoryName}${walletForThisCategory > 0 ? ` (${walletForThisCategory} wallet balance applied)` : ''}${refundForThisCategory > 0 && !isReassignment ? ` (${refundForThisCategory} refund applied)` : ''}${isReassignment ? ' (Reassignment - No Refunds)' : ''}`,
        logo: process.env.LOGO_URL || ""
      },
      meta: {
        adId: adId,
        websiteId: websiteId,
        categoryId: categoryId,
        webOwnerId: website.ownerId,
        advertiserId: userId,
        walletApplied: walletForThisCategory,
        refundApplied: isReassignment ? 0 : refundForThisCategory, // FORCE 0 for reassignment
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
        refundApplied: isReassignment ? 0 : refundForThisCategory, // FORCE 0 for reassignment
        amountPaid: remainingAmount,
        paymentMethod: walletForThisCategory > 0 ? 'wallet_hybrid' : (refundForThisCategory > 0 && !isReassignment ? 'refund_hybrid' : 'flutterwave'),
        isReassignment: isReassignment,
        notes: isReassignment ? 'Ad reassignment payment - no refunds applied' : undefined
      });

      await payment.save();

      res.status(200).json({
        success: true,
        paymentUrl: response.data.link,
        paymentId: payment._id,
        tx_ref: tx_ref,
        walletApplied: walletForThisCategory,
        refundApplied: isReassignment ? 0 : refundForThisCategory, // FORCE 0 for reassignment
        amountPaid: remainingAmount,
        totalCost: category.price,
        isReassignment: isReassignment,
        paymentMethod: payment.paymentMethod,
        reassignmentNote: isReassignment ? 'Reassignment payment - refunds not applicable' : null
      });
    } else {
      res.status(400).json({ error: 'Payment initiation failed', details: response });
    }
    
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

const generateUniqueTransactionRef = (prefix, userId, additionalData = '') => {
  const timestamp = Date.now();
  const nanoTime = process.hrtime.bigint().toString(); // High-resolution time for better uniqueness
  const random = crypto.randomBytes(8).toString('hex'); // More secure random
  const counter = Math.floor(Math.random() * 9999); // Additional counter
  
  // Create a more robust hash
  const hash = crypto.createHash('sha256')
    .update(`${userId}_${additionalData}_${timestamp}_${nanoTime}_${random}_${counter}`)
    .digest('hex')
    .substring(0, 12); // Longer hash for better uniqueness
  
  return `${prefix}_${userId}_${hash}_${timestamp}_${counter}`;
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

    // FIXED: Block any refund operations for reassignment at the start
    if (isReassignment) {
      console.log('REASSIGNMENT DETECTED - Refunds will be blocked');
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

    if (isReassignment && walletBalance < totalCost) {
      console.log('Processing hybrid payment for reassignment (wallet + card only)');
      
      const walletToUse = Math.min(walletBalance, totalCost);
      const remainingAmount = totalCost - walletToUse;
      
      // Generate base reference for grouping
      const baseHybridRef = generateUniqueTransactionRef(
        'hybrid_reassignment_base',
        userId,
        `${selections.length}_selections_${totalCost}_${Date.now()}`
      );

      // CREATE PAYMENT RECORDS FOR EACH SELECTION BEFORE FLUTTERWAVE REDIRECT
      await session.withTransaction(async () => {
        for (let i = 0; i < processedSelections.length; i++) {
          const selection = processedSelections[i];
          
          // Create UNIQUE transaction reference for each payment record
          const individualTxRef = generateUniqueTransactionRef(
            'hybrid_reassignment_item',
            userId,
            `${selection.adId}_${selection.categoryId}_${i}_${baseHybridRef}_${Date.now()}_${Math.random()}`
          );

          const payment = new Payment({
            advertiserId: userId,
            tx_ref: individualTxRef, // UNIQUE for each record
            baseReference: baseHybridRef, // Group reference for tracking
            amount: selection.price,
            paymentType: 'hybrid_reassignment',
            status: 'pending', // Important: Set as pending, not completed
            adId: selection.adId,
            websiteId: selection.websiteId,
            categoryId: selection.categoryId,
            webOwnerId: selection.category.ownerId, // Required field from category
            paymentId: `pending_${individualTxRef}`, // Use individual ref
            isReassignment: true,
            walletApplied: walletToUse * (selection.price / totalCost), // Proportional wallet amount
            refundApplied: 0, // Always 0 for reassignment
            amountPaid: remainingAmount * (selection.price / totalCost), // Proportional card amount
            createdAt: new Date(),
            metadata: {
              selectionIndex: i,
              totalSelections: processedSelections.length,
              hybridPayment: true,
              baseReference: baseHybridRef
            }
          });

          await payment.save({ session });
          
          console.log(`Created payment record ${i + 1}/${processedSelections.length}:`, {
            id: payment._id,
            tx_ref: payment.tx_ref,
            baseReference: payment.baseReference,
            amount: payment.amount,
            status: payment.status
          });
        }
      });

      // NOW generate Flutterwave payment URL using base reference
      const paymentUrl = await this.generateFlutterwavePaymentUrl({
        amount: remainingAmount,
        tx_ref: baseHybridRef, // Use base reference for Flutterwave
        customer: {
          email: req.user.email,
          name: req.user.name || 'User'
        },
        customizations: {
          title: `Ad Category Payment (Reassignment)`,
          description: `Reassignment payment for ${processedSelections.length} categories - No refunds applied`
        }
      });

      res.status(200).json({
        success: true,
        allPaid: false,
        message: `Partial reassignment payment processed. ${walletToUse.toFixed(2)} deducted from wallet. Complete payment of ${remainingAmount.toFixed(2)} via card.`,
        summary: {
          message: `Partial reassignment payment processed. ${walletToUse.toFixed(2)} deducted from wallet. Complete payment of ${remainingAmount.toFixed(2)} via card.`,
          totalCost: totalCost,
          walletUsed: walletToUse,
          cardAmount: remainingAmount,
          refundUsed: 0,
          isReassignment: true
        },
        paymentUrl: paymentUrl,
        tx_ref: baseHybridRef, // Return base reference for tracking
        paymentCount: processedSelections.length
      });
    
    } else if (!isReassignment && walletBalance < totalCost) {
      // SAME FIX FOR NEW AD HYBRID PAYMENTS
      console.log('Processing hybrid payment for new ad (wallet + refunds + card allowed)');
      
      const availableRefunds = await Payment.getAllAvailableRefunds(userId);
      const walletToUse = Math.min(walletBalance, totalCost);
      let remainingAfterWallet = totalCost - walletToUse;
      const refundToUse = Math.min(availableRefunds, remainingAfterWallet);
      const remainingAmount = remainingAfterWallet - refundToUse;
      
      const baseHybridRef = generateUniqueTransactionRef(
        'hybrid_base',
        userId,
        `${selections.length}_selections_${totalCost}_${Date.now()}`
      );

      // CREATE PAYMENT RECORDS FIRST
      await session.withTransaction(async () => {
        for (let i = 0; i < processedSelections.length; i++) {
          const selection = processedSelections[i];
          
          // Create UNIQUE transaction reference for each payment record
          const individualTxRef = generateUniqueTransactionRef(
            'hybrid_item',
            userId,
            `${selection.adId}_${selection.categoryId}_${i}_${baseHybridRef}_${Date.now()}_${Math.random()}`
          );
          
          const payment = new Payment({
            advertiserId: userId,
            tx_ref: individualTxRef, // UNIQUE for each record
            baseReference: baseHybridRef, // Group reference
            amount: selection.price,
            paymentType: 'hybrid',
            status: 'pending',
            adId: selection.adId,
            websiteId: selection.websiteId,
            categoryId: selection.categoryId,
            webOwnerId: selection.category.ownerId, // Required field from category
            paymentId: `pending_${individualTxRef}`, // Use individual ref
            isReassignment: false,
            walletApplied: walletToUse * (selection.price / totalCost),
            refundApplied: refundToUse * (selection.price / totalCost),
            amountPaid: remainingAmount * (selection.price / totalCost),
            createdAt: new Date(),
            metadata: {
              selectionIndex: i,
              totalSelections: processedSelections.length,
              hybridPayment: true,
              baseReference: baseHybridRef
            }
          });

          await payment.save({ session });
        }
      });

      // Generate payment URL
      const paymentUrl = await this.generateFlutterwavePaymentUrl({
        amount: remainingAmount,
        tx_ref: baseHybridRef, // Use base reference for Flutterwave
        customer: {
          email: req.user.email,
          name: req.user.name || 'User'
        },
        customizations: {
          title: `Ad Category Payment`,
          description: `Payment for ${processedSelections.length} categories`
        }
      });

      res.status(200).json({
        success: true,
        allPaid: false,
        message: `Partial payment processed. ${(walletToUse + refundToUse).toFixed(2)} applied from wallet/refunds. Complete payment of ${remainingAmount.toFixed(2)} via card.`,
        summary: {
          message: `Partial payment processed. ${(walletToUse + refundToUse).toFixed(2)} applied from wallet/refunds. Complete payment of ${remainingAmount.toFixed(2)} via card.`,
          totalCost: totalCost,
          walletUsed: walletToUse,
          cardAmount: remainingAmount,
          refundUsed: refundToUse,
          isReassignment: false
        },
        paymentUrl: paymentUrl,
        tx_ref: baseHybridRef, // Return base reference for tracking
        paymentCount: processedSelections.length
      });
    }

    // Handle full wallet payment cases (both reassignment and new ads)
    else if (walletBalance >= totalCost) {
      console.log('Processing full wallet payment');
      
      // Generate base reference for grouping
      const baseWalletRef = generateUniqueTransactionRef(
        isReassignment ? 'wallet_reassignment_base' : 'wallet_base',
        userId,
        `${selections.length}_selections_${totalCost}_${Date.now()}`
      );

      await session.withTransaction(async () => {
        // Deduct from wallet first
        await Wallet.findOneAndUpdate(
          { ownerId: userId, ownerType: 'advertiser' },
          { 
            $inc: { 
              balance: -totalCost,
              totalSpent: totalCost
            },
            lastUpdated: new Date()
          },
          { session }
        );

        // Create payment records and process each selection
        for (let i = 0; i < processedSelections.length; i++) {
          const selection = processedSelections[i];
          
          // Create UNIQUE transaction reference for each payment record
          const individualTxRef = generateUniqueTransactionRef(
            isReassignment ? 'wallet_reassignment_item' : 'wallet_item',
            userId,
            `${selection.adId}_${selection.categoryId}_${i}_${baseWalletRef}_${Date.now()}_${Math.random()}`
          );

          const payment = new Payment({
            advertiserId: userId,
            tx_ref: individualTxRef, // UNIQUE for each record
            baseReference: baseWalletRef, // Group reference
            amount: selection.price,
            paymentType: isReassignment ? 'wallet_reassignment' : 'wallet',
            status: 'successful', // Wallet payments are immediately successful
            adId: selection.adId,
            websiteId: selection.websiteId,
            categoryId: selection.categoryId,
            webOwnerId: selection.category.ownerId,
            paymentId: individualTxRef, // Use individual ref as payment ID
            isReassignment: isReassignment,
            walletApplied: selection.price, // Full amount from wallet
            refundApplied: isReassignment ? 0 : 0, // No refunds for full wallet payment
            amountPaid: 0, // No external payment needed
            paidAt: new Date(),
            createdAt: new Date(),
            metadata: {
              selectionIndex: i,
              totalSelections: processedSelections.length,
              fullWalletPayment: true,
              baseReference: baseWalletRef
            }
          });

          await payment.save({ session });

          // Update ad's website selection
          await ImportAd.findOneAndUpdate(
            { 
              _id: selection.adId,
              'websiteSelections.websiteId': selection.websiteId,
              'websiteSelections.categories': selection.categoryId
            },
            {
              $set: {
                'websiteSelections.$.approved': true,
                'websiteSelections.$.approvedAt': new Date(),
                'websiteSelections.$.status': 'active',
                'websiteSelections.$.publishedAt': new Date()
              }
            },
            { session }
          );

          // Update category selected ads
          await AdCategory.findByIdAndUpdate(
            selection.categoryId,
            { $addToSet: { selectedAds: selection.adId } },
            { session }
          );

          // Update website owner's wallet
          await Wallet.findOneAndUpdate(
            { ownerId: selection.category.ownerId, ownerType: 'webOwner' },
            { 
              $inc: { 
                balance: selection.price,
                totalEarned: selection.price
              },
              lastUpdated: new Date()
            },
            { session, upsert: true }
          );
        }
      });

      // Get updated wallet balance
      const updatedWallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });

      res.status(200).json({
        success: true,
        allPaid: true,
        message: `All payments processed successfully using wallet balance. Remaining balance: ${updatedWallet.balance.toFixed(2)}`,
        summary: {
          message: `All payments processed successfully using wallet balance. Remaining balance: ${updatedWallet.balance.toFixed(2)}`,
          totalCost: totalCost,
          walletUsed: totalCost,
          cardAmount: 0,
          refundUsed: 0,
          isReassignment: isReassignment,
          remainingBalance: updatedWallet.balance
        },
        tx_ref: baseWalletRef,
        paymentCount: processedSelections.length
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
    const payment = new Payment({
      userId,
      tx_ref: transactionRef,
      amount: walletAmount,
      paymentType: 'wallet',
      status: 'completed',
      adId,
      websiteId,
      categoryId,
      isReassignment
    });
    await payment.save({ session });

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

exports.generateFlutterwavePaymentUrl = async (paymentData) => {
  try {
    // Check if Flutterwave secret key is configured
    const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_TEST_SECRET_KEY;
    const frontendUrl = process.env.FRONTEND_URL || 'https://demo.yepper.cc';
    
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
      redirect_url: `${frontendUrl}/payment-callback2`,
      hasSecretKey: !!flutterwaveSecretKey
    });

    const flutterwaveResponse = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      {
        tx_ref: paymentData.tx_ref,
        amount: paymentData.amount,
        currency: 'USD', // or your preferred currency
        redirect_url: `${frontendUrl}/payment-callback2`,
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
    
    // FIXED: Only get refund credits if NOT reassignment
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

    // FIXED: Different logic for reassignment vs new ads
    let paidFromWallet = 0;
    let paidFromRefunds = 0;
    let needsExternalPayment = 0;

    if (isReassignment) {
      // REASSIGNMENT: Only wallet + external payment - NO REFUNDS
      if (walletBalance >= totalCost) {
        paidFromWallet = totalCost;
      } else {
        paidFromWallet = walletBalance;
        needsExternalPayment = totalCost - walletBalance;
      }
      paidFromRefunds = 0; // ALWAYS 0 for reassignment
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

    // FIXED: Create breakdown for each category with reassignment logic
    let remainingWallet = paidFromWallet;
    let remainingRefunds = isReassignment ? 0 : paidFromRefunds; // Force 0 for reassignment
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
        
        // FIXED: Only use refunds for NEW ads, not reassignment
        if (!isReassignment && remainingRefunds >= stillNeeded) {
          refundUsed = stillNeeded;
          remainingRefunds -= stillNeeded;
        } else if (!isReassignment && remainingRefunds > 0) {
          refundUsed = remainingRefunds;
          externalNeeded = stillNeeded - remainingRefunds;
          remainingRefunds = 0;
          remainingExternal -= externalNeeded;
        } else {
          // For reassignment OR when no refunds available
          externalNeeded = stillNeeded;
          remainingExternal -= externalNeeded;
        }
      } else if (!isReassignment && remainingRefunds >= cat.price) {
        // Only for NEW ads
        refundUsed = cat.price;
        remainingRefunds -= cat.price;
      } else if (!isReassignment && remainingRefunds > 0) {
        // Only for NEW ads
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
        refundUsed: isReassignment ? 0 : refundUsed, // FORCE 0 for reassignment
        externalPayment: externalNeeded,
        paymentMethod: externalNeeded > 0 ? 'external' : (refundUsed > 0 && !isReassignment ? 'refund_or_wallet' : 'wallet')
      };
    });

    res.status(200).json({
      success: true,
      breakdown: breakdown,
      summary: {
        totalCost,
        walletBalance,
        availableRefunds: isReassignment ? 0 : availableRefunds, // FORCE 0 for reassignment display
        paidFromWallet,
        paidFromRefunds: isReassignment ? 0 : paidFromRefunds, // FORCE 0 for reassignment
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

exports.debugRoutes = (req, res) => {
  console.log('=== PAYMENT ROUTES DEBUG ===');
  console.log('Available routes:');
  console.log('POST /payment/verify-with-refund');
  console.log('POST /payment/verify-non-transactional');
  console.log('POST /payment/initiate-with-refund');
  console.log('POST /payment/process-wallet');
  console.log('POST /payment/calculate-breakdown');
  console.log('POST /payment/validate-category');
  console.log('POST /payment/webhook');
  console.log('=== END DEBUG ===');
  
  res.json({
    success: true,
    message: 'Payment routes are working',
    availableRoutes: [
      'POST /payment/verify-with-refund',
      'POST /payment/verify-non-transactional',
      'POST /payment/initiate-with-refund',
      'POST /payment/process-wallet',
      'POST /payment/calculate-breakdown',
      'POST /payment/validate-category',
      'POST /payment/webhook'
    ]
  });
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