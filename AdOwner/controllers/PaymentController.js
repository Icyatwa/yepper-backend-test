// // PaymentController.js
// const Flutterwave = require('flutterwave-node-v3');
// const axios = require('axios');
// const Payment = require('../models/PaymentModel');
// const ImportAd = require('../models/WebAdvertiseModel');
// const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
// const Website = require('../../AdPromoter/models/CreateWebsiteModel');
// const { Wallet, WalletTransaction } = require('../../AdPromoter/models/WalletModel');
// const mongoose = require('mongoose');

// const flw = new Flutterwave(process.env.FLW_TEST_PUBLIC_KEY, process.env.FLW_TEST_SECRET_KEY);

// exports.initiatePayment = async (req, res) => {
//   try {
//     const { adId, websiteId, categoryId } = req.body;
//     const userId = req.user.userId || req.user.id || req.user._id;
//     const ad = await ImportAd.findById(adId);
//     const category = await AdCategory.findById(categoryId).populate('websiteId');
//     const website = await Website.findById(websiteId);
    
//     const existingSelection = ad.websiteSelections.find(
//       sel => sel.websiteId.toString() === websiteId && 
//              sel.categories.includes(categoryId) &&
//              ['paid', 'active'].includes(sel.status)
//     );

//     if (existingSelection) {
//       return res.status(400).json({ error: 'This ad space is already paid for' });
//     }

//     const amount = category.price;
//     const tx_ref = `ad_${adId}_${websiteId}_${categoryId}_${Date.now()}`;
    
//     const paymentData = {
//       tx_ref: tx_ref,
//       amount: amount,
//       currency: 'USD',
//       redirect_url: `${process.env.FRONTEND_URL}/payment/callback`,
//       customer: {
//         email: ad.adOwnerEmail,
//         name: ad.businessName
//       },
//       customizations: {
//         title: `Advertisement on ${website.websiteName}`,
//         description: `Payment for ad space: ${category.categoryName}`,
//         logo: process.env.LOGO_URL || ""
//       },
//       meta: {
//         adId: adId,
//         websiteId: websiteId,
//         categoryId: categoryId,
//         webOwnerId: website.ownerId,
//         advertiserId: userId
//       }
//     };

//     const apiResponse = await axios.post('https://api.flutterwave.com/v3/payments', paymentData, {
//       headers: {
//         'Authorization': `Bearer ${process.env.FLW_TEST_SECRET_KEY}`,
//         'Content-Type': 'application/json'
//       }
//     });
    
//     const response = {
//       status: apiResponse.data.status,
//       data: apiResponse.data.data
//     };

//     if (response.status === 'success') {
//       const payment = new Payment({
//         paymentId: tx_ref,
//         tx_ref: tx_ref,
//         adId: adId,
//         advertiserId: userId,
//         webOwnerId: website.ownerId,
//         websiteId: websiteId,
//         categoryId: categoryId,
//         amount: amount,
//         status: 'pending',
//         flutterwaveData: response.data
//       });

//       await payment.save();

//       res.status(200).json({
//         success: true,
//         paymentUrl: response.data.link,
//         paymentId: payment._id,
//         tx_ref: tx_ref
//       });
//     } else {
//       res.status(400).json({ error: 'Payment initiation failed', details: response });
//     }

//   } catch (error) {
//     res.status(500).json({ error: 'Internal server error', message: error.message });
//   }
// };

// exports.verifyPayment = async (req, res) => {
//   const session = await mongoose.startSession();
  
//   try {
//     const { transaction_id, tx_ref } = req.body;
//     const identifier = transaction_id || tx_ref;
//     const response = await flw.Transaction.verify({ id: identifier });

//     if (response.status === 'success' && response.data.status === 'successful') {
//       let payment = await Payment.findOne({ 
//         $or: [
//           { tx_ref: response.data.tx_ref },
//           { paymentId: identifier }
//         ]
//       });

//       if (payment.status === 'successful') {
//         return res.status(200).json({ 
//           success: true, 
//           message: 'Payment already processed',
//           payment: payment 
//         });
//       }

//       await session.withTransaction(async () => {
//         payment.paymentId = response.data.id;
//         payment.status = 'successful';
//         payment.paidAt = new Date();
//         payment.flutterwaveData.set('verification', response.data);
//         await payment.save({ session });

//         const ad = await ImportAd.findById(payment.adId).session(session);
//         const selectionIndex = ad.websiteSelections.findIndex(
//           sel => sel.websiteId.toString() === payment.websiteId.toString() &&
//                  sel.categories.includes(payment.categoryId)
//         );

//         const now = new Date();
//         const rejectionDeadline = new Date(now.getTime() + 60 * 1000); // 1 minute for testing

//         if (selectionIndex !== -1) {
//           ad.websiteSelections[selectionIndex].status = 'active';
//           ad.websiteSelections[selectionIndex].approved = false; // Not approved initially
//           ad.websiteSelections[selectionIndex].publishedAt = now;
//           ad.websiteSelections[selectionIndex].paymentId = payment._id;
//           ad.websiteSelections[selectionIndex].rejectionDeadline = rejectionDeadline;
//         } else {
//           ad.websiteSelections.push({
//             websiteId: payment.websiteId,
//             categories: [payment.categoryId],
//             approved: false, // Not approved initially
//             publishedAt: now,
//             paymentId: payment._id,
//             status: 'active',
//             rejectionDeadline: rejectionDeadline
//           });
//         }

//         // Add to ad budget
//         ad.budget += payment.amount;
//         await ad.save({ session });

//         await AdCategory.findByIdAndUpdate(
//           payment.categoryId,
//           { $addToSet: { selectedAds: payment.adId } },
//           { session }
//         );

//         // Don't add to wallet immediately - wait for approval or deadline
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Payment verified and ad published. Website owner has 1 minute to review.',
//         payment: payment
//       });

//     } else {
//       await Payment.findOneAndUpdate(
//         { 
//           $or: [
//             { tx_ref: identifier },
//             { paymentId: identifier },
//             { tx_ref: response.data?.tx_ref }
//           ]
//         },
//         { 
//           status: 'failed',
//           flutterwaveData: response.data 
//         }
//       );

//       res.status(400).json({ 
//         success: false, 
//         message: 'Payment verification failed',
//         details: response.data 
//       });
//     }

//   } catch (error) {
//     console.error('Payment verification error:', error);
//     await session.abortTransaction();
//     res.status(500).json({ error: 'Internal server error', message: error.message });
//   } finally {
//     await session.endSession();
//   }
// };

// // Reject ad endpoint
// exports.rejectAd = async (req, res) => {
//   const session = await mongoose.startSession();
  
//   try {
//     const { adId, websiteId, categoryId, rejectionReason } = req.body;
//     const webOwnerId = req.user.userId || req.user.id || req.user._id;

//     await session.withTransaction(async () => {
//       const ad = await ImportAd.findById(adId).session(session);
//       const website = await Website.findById(websiteId).session(session);
      
//       // Verify web owner
//       if (website.ownerId !== webOwnerId) {
//         throw new Error('Unauthorized to reject this ad');
//       }

//       const selectionIndex = ad.websiteSelections.findIndex(
//         sel => sel.websiteId.toString() === websiteId &&
//                sel.categories.includes(categoryId) &&
//                sel.status === 'active'
//       );

//       if (selectionIndex === -1) {
//         throw new Error('Ad selection not found or already processed');
//       }

//       const selection = ad.websiteSelections[selectionIndex];
      
//       // Check if still within rejection period
//       if (new Date() > selection.rejectionDeadline) {
//         throw new Error('Rejection period has expired');
//       }

//       // Mark as rejected
//       selection.status = 'rejected';
//       selection.rejectedAt = new Date();
//       selection.rejectionReason = rejectionReason;

//       // Add to rejected websites list
//       ad.rejectedWebsites.push({
//         websiteId: websiteId,
//         rejectedAt: new Date()
//       });

//       // Mark as marketplace available
//       ad.isMarketplace = true;
//       ad.marketplacePrice = selection.categories.length > 0 ? 
//         (await AdCategory.findById(selection.categories[0]).session(session)).price : 0;

//       await ad.save({ session });

//       // Remove from category's selected ads
//       await AdCategory.findByIdAndUpdate(
//         categoryId,
//         { $pull: { selectedAds: adId } },
//         { session }
//       );

//       // Find and update payment
//       const payment = await Payment.findById(selection.paymentId).session(session);
//       if (payment) {
//         payment.status = 'refunded';
//         payment.refundedAt = new Date();
//         await payment.save({ session });
//       }
//     });

//     res.status(200).json({
//       success: true,
//       message: 'Ad rejected successfully. Budget returned to advertiser.'
//     });

//   } catch (error) {
//     res.status(500).json({ 
//       error: 'Failed to reject ad', 
//       message: error.message 
//     });
//   } finally {
//     await session.endSession();
//   }
// };

// // Accept ad from marketplace
// exports.acceptMarketplaceAd = async (req, res) => {
//   const session = await mongoose.startSession();
  
//   try {
//     const { adId, websiteId, categoryId } = req.body;
//     const webOwnerId = req.user.userId || req.user.id || req.user._id;

//     await session.withTransaction(async () => {
//       const ad = await ImportAd.findById(adId).session(session);
//       const website = await Website.findById(websiteId).session(session);
//       const category = await AdCategory.findById(categoryId).session(session);

//       // Verify ownership and marketplace availability
//       if (website.ownerId !== webOwnerId) {
//         throw new Error('Unauthorized');
//       }

//       if (!ad.isMarketplace || ad.budget < category.price) {
//         throw new Error('Ad not available or insufficient budget');
//       }

//       // Check if this website was previously rejected
//       const wasRejected = ad.rejectedWebsites.some(
//         rejected => rejected.websiteId.toString() === websiteId
//       );
      
//       if (wasRejected) {
//         throw new Error('This ad was previously rejected by your website');
//       }

//       const now = new Date();
//       const rejectionDeadline = new Date(now.getTime() + 60 * 1000);

//       // Add new selection
//       ad.websiteSelections.push({
//         websiteId: websiteId,
//         categories: [categoryId],
//         approved: false,
//         publishedAt: now,
//         status: 'active',
//         rejectionDeadline: rejectionDeadline
//       });

//       // Deduct from budget
//       ad.budget -= category.price;
      
//       // If no budget left, remove from marketplace
//       if (ad.budget < category.price) {
//         ad.isMarketplace = false;
//       }

//       await ad.save({ session });

//       // Add to category
//       await AdCategory.findByIdAndUpdate(
//         categoryId,
//         { $addToSet: { selectedAds: adId } },
//         { session }
//       );
//     });

//     res.status(200).json({
//       success: true,
//       message: 'Ad accepted from marketplace. You have 1 minute to review.'
//     });

//   } catch (error) {
//     res.status(500).json({ 
//       error: 'Failed to accept ad', 
//       message: error.message 
//     });
//   } finally {
//     await session.endSession();
//   }
// };

// exports.handleWebhook = async (req, res) => {
//   try {
//     const secretHash = process.env.FLW_SECRET_HASH;
//     const signature = req.headers["verif-hash"];

//     if (!signature || signature !== secretHash) {
//       return res.status(401).json({ error: 'Unauthorized webhook' });
//     }

//     const payload = req.body;

//     if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
//       // Process successful payment using transaction ID
//       await this.verifyPayment({ 
//         body: { 
//           transaction_id: payload.data.id,
//           tx_ref: payload.data.tx_ref 
//         } 
//       }, res);
//     }

//     res.status(200).json({ status: 'success' });

//   } catch (error) {
//     console.error('Webhook error:', error);
//     res.status(500).json({ error: 'Webhook processing failed' });
//   }
// };















// PaymentController.js
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
const Payment = require('../models/PaymentModel');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/WalletModel');
const mongoose = require('mongoose');

const flw = new Flutterwave(process.env.FLW_TEST_PUBLIC_KEY, process.env.FLW_TEST_SECRET_KEY);

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
  const session = await mongoose.startSession();
  
  try {
    const { transaction_id, tx_ref } = req.body;
    
    // Use tx_ref if transaction_id is not provided
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
          
          // ADD THIS LINE:
          const rejectionDeadline = new Date();
          rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);
          ad.websiteSelections[selectionIndex].rejectionDeadline = rejectionDeadline;
          
        } else {
          // Create new selection if it doesn't exist
          const rejectionDeadline = new Date();
          rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);
          
          ad.websiteSelections.push({
            websiteId: payment.websiteId,
            categories: [payment.categoryId],
            approved: true,
            approvedAt: new Date(),
            publishedAt: new Date(),
            paymentId: payment._id,
            status: 'active',
            rejectionDeadline: rejectionDeadline // ADD THIS
          });
        }

        // Check if all selections are approved (for confirmed status)
        const allApproved = ad.websiteSelections.every(sel => sel.approved);
        if (allApproved) {
          ad.confirmed = true;
        }

        await ad.save({ session });

        // Add ad to category's selectedAds
        await AdCategory.findByIdAndUpdate(
          payment.categoryId,
          { $addToSet: { selectedAds: payment.adId } },
          { session }
        );

        // Update or create wallet for web owner
        let wallet = await Wallet.findOne({ ownerId: payment.webOwnerId }).session(session);
        
        if (!wallet) {
          // Get website and category details to find the owner's email
          const website = await Website.findById(payment.websiteId).session(session);
          const category = await AdCategory.findById(payment.categoryId).session(session);
          
          // Use webOwnerEmail from category as it has the required email field
          const ownerEmail = category.webOwnerEmail;
          
          if (!ownerEmail) {
            throw new Error('Website owner email not found');
          }
          
          wallet = new Wallet({
            ownerId: payment.webOwnerId,
            ownerEmail: ownerEmail, // Use email from category
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
          description: `Payment for ad: ${ad.businessName} on category: ${payment.categoryId}`
        });

        await walletTransaction.save({ session });
      });

      // Transaction completed successfully
      res.status(200).json({
        success: true,
        message: 'Payment verified and ad published successfully',
        payment: payment
      });

    } else {
      // Payment failed - find by tx_ref or transaction_id
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
    // Always end the session properly
    await session.endSession();
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