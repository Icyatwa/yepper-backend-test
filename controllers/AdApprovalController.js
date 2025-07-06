// AdApprovalController.js
const axios = require('axios');
const mongoose = require('mongoose');
const Flutterwave = require('flutterwave-node-v3');
const ImportAd = require('../models/ImportAdModel');
const AdCategory = require('../models/AdCategoryModel');
const Website = require('../models/WebsiteModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel'); // Balance tracking model
const Payment = require('../models/PaymentModel');
const PaymentTracker = require('../models/PaymentTracker');
const Withdrawal = require('../models/WithdrawalModel');
const sendEmailNotification = require('./emailService');
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

  // Prepare Flutterwave transfer payload
  static prepareTransferPayload(phoneNumber, amount, userId) {
    const reference = `WITHDRAWAL-${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return {
      account_bank: 'MPS',
      account_number: phoneNumber,
      amount,
      currency: 'RWF',
      beneficiary_name: 'MoMo Transfer',
      reference,
      callback_url: "https://yepper-backend.onrender.com/api/accept/withdrawal-callback",
      debit_currency: 'RWF'
    };
  }
}

exports.getPendingAds = async (req, res) => {
  try {
    const { ownerId } = req.params;
    
    // First verify the requesting user owns these websites
    const websites = await Website.find({ 
      ownerId: ownerId 
    });
    
    if (!websites.length) {
      return res.status(403).json({ 
        message: 'No websites found for this owner' 
      });
    }

    const websiteIds = websites.map(website => website._id);

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

    // Filter out any selections where websiteId is null (means user doesn't own it)
    const transformedAds = pendingAds
      .map(ad => {
        // Only include website selections the user owns
        const validSelections = ad.websiteSelections.filter(
          selection => selection.websiteId !== null
        );

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

    res.status(200).json(transformedAds);
  } catch (error) {
    console.error('Server error:', error);
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

exports.getPendingAdById = async (req, res) => {
  try {
    const { adId } = req.params;
    console.log('Fetching ad with ID:', adId); // Debugging log

    const ad = await ImportAd.findById(adId)
      // .populate('selectedSpaces selectedCategories selectedWebsites');
      .populate('selectedCategories selectedWebsites');

    if (!ad) {
      console.log('Ad not found for ID:', adId); // Log when ad is missing
      return res.status(404).json({ message: 'Ad not found' });
    }

    res.status(200).json(ad);
  } catch (error) {
    console.error('Error fetching ad:', error); // Catch any unexpected errors
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.approveAd = async (req, res) => {
  try {
    const { adId } = req.params;

    // Only update the approved status, don't push to API yet
    const approvedAd = await ImportAd.findByIdAndUpdate(
      adId,
      { approved: true },
      { new: true }
    ).populate('userId');

    if (!approvedAd) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    // Notify the ad owner about approval (implement your notification system here)
    console.log(`Notification: Ad for ${approvedAd.businessName} has been approved. Awaiting confirmation from the ad owner.`);
    
    // // Notify each web owner via email
    //   const emailBody = `
    //     <h2>Your Ad has been approved</h2>
    //     <p>Hello,</p>
    //     <p><strong>Business Name:</strong> ${approvedAd.businessName}</p>
    //     <p><strong>Description:</strong> ${approvedAd.adDescription}</p>
    //   `;
    //   await sendEmailNotification(approvedAd.adOwnerEmail, 'New Ad Request for Your Space', emailBody);

    res.status(200).json({
      message: 'Ad approved successfully. Waiting for advertiser confirmation.',
      ad: approvedAd
    });

  } catch (error) {
    console.error('Error approving ad:', error);
    res.status(500).json({ message: 'Internal Server Error' });
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

exports.getApprovedAds = async (req, res) => {
  try {
    const approvedAds = await ImportAd.find({ approved: true })
      .populate('selectedSpaces selectedWebsites selectedCategories');

    res.status(200).json(approvedAds);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching approved ads' });
  }
};

exports.getApprovedAdsByUser = async (req, res) => {
  try {
    const { ownerId } = req.params;  // Owner's ID from params

    // Fetch the owner's websites, categories, and ad spaces
    const websites = await Website.find({ ownerId });
    const websiteIds = websites.map(website => website._id);

    const categories = await AdCategory.find({ websiteId: { $in: websiteIds } });
    const categoryIds = categories.map(category => category._id);

    const adSpaces = await AdSpace.find({ categoryId: { $in: categoryIds } });
    const adSpaceIds = adSpaces.map(space => space._id);

    // Fetch approved ads that belong to the owner's ad spaces
    const approvedAds = await ImportAd.find({
      approved: true,
      selectedSpaces: { $in: adSpaceIds }
    }).populate('selectedSpaces selectedCategories selectedWebsites');

    res.status(200).json(approvedAds);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching approved ads' });
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







// exports.initiateAdPayment = async (req, res) => {
//   try {
//     const { adId, websiteId, amount, email, phoneNumber, userId } = req.body;

//     // Input validation
//     if (!adId || !websiteId || !amount || !email || !userId) {
//       return res.status(400).json({ 
//         message: 'Missing required fields', 
//         required: ['adId', 'websiteId', 'amount', 'email', 'userId'] 
//       });
//     }

//     // Check if the ad is already confirmed for this website
//     const existingAd = await ImportAd.findOne({
//       _id: adId,
//       'websiteSelections': {
//         $elemMatch: {
//           websiteId: websiteId,
//           confirmed: true
//         }
//       }
//     });

//     if (existingAd) {
//       return res.status(400).json({ message: 'Ad is already confirmed for this website' });
//     }

//     // Find ad and verify it's approved but not confirmed
//     const ad = await ImportAd.findOne({
//       _id: adId,
//       'websiteSelections': {
//         $elemMatch: {
//           websiteId: websiteId,
//           approved: true,
//           confirmed: { $ne: true }
//         }
//       }
//     });

//     if (!ad) {
//       return res.status(404).json({ message: 'Ad not found or not approved for this website' });
//     }

//     // Get website selection and verify categories
//     const websiteSelection = ad.websiteSelections.find(
//       selection => selection.websiteId.toString() === websiteId.toString()
//     );

//     if (!websiteSelection || !websiteSelection.categories?.length) {
//       return res.status(400).json({ message: 'Invalid website selection or no categories selected' });
//     }

//     // Verify categories exist
//     const categories = await AdCategory.find({
//       _id: { $in: websiteSelection.categories },
//       websiteId: websiteId
//     });

//     if (!categories.length) {
//       return res.status(404).json({ message: 'Categories not found for this website' });
//     }

//     const tx_ref = `AD-${Date.now()}-${adId}-${websiteId}`;

//     // Create payment record first
//     const payment = new Payment({
//       tx_ref,
//       amount: Number(amount),
//       currency: 'USD',
//       email,
//       userId,
//       adId,
//       websiteId,
//       webOwnerId: categories[0].ownerId,
//       status: 'pending'
//     });

//     await payment.save();

//     // Construct Flutterwave payment payload
//     const paymentPayload = {
//       tx_ref,
//       amount: Number(amount),
//       currency: 'USD',
//       redirect_url: "https://yepper-backend.onrender.com/api/accept/callback",
//       payment_options: 'card', // Specify card payment only
//       meta: {
//         adId,
//         websiteId,
//         userId
//       },
//       customer: {
//         email,
//         name: ad.businessName || email
//       },
//       customizations: {
//         title: 'Ad Space Payment',
//         description: `Payment for ad space on website - ${ad.businessName}`,
//         logo: process.env.COMPANY_LOGO_URL || ''
//       }
//     };

//     console.log('Flutterwave payment payload:', JSON.stringify(paymentPayload, null, 2));

//     // Make request to Flutterwave
//     const response = await axios.post(
//       'https://api.flutterwave.com/v3/payments', 
//       paymentPayload, 
//       {
//         headers: { 
//           Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
//           'Content-Type': 'application/json'
//         }
//       }
//     );

//     if (response.data?.status === 'success' && response.data?.data?.link) {
//       res.status(200).json({ 
//         paymentLink: response.data.data.link,
//         tx_ref
//       });
//     } else {
//       throw new Error('Invalid payment response from Flutterwave');
//     }
//   } catch (error) {
//     console.error('Error initiating payment:', error.response?.data || error.message);
    
//     if (error.response?.status === 400) {
//       try {
//         await Payment.findOneAndDelete({ tx_ref });
//       } catch (deleteError) {
//         console.error('Error deleting failed payment record:', deleteError);
//       }
//     }

//     res.status(500).json({ 
//       message: 'Error initiating payment',
//       error: error.response?.data?.message || error.message
//     });
//   }
// };

// exports.adPaymentCallback = async (req, res) => {
//   const session = await mongoose.startSession();
//   let transactionStarted = false;

//   try {
//     const { tx_ref, transaction_id } = req.query;
//     if (!tx_ref || !transaction_id) {
//       return res.redirect('https://yepper.cc/approved-ads?status=invalid-params');
//     }

//     // Parse adId and websiteId from tx_ref
//     const [prefix, timestamp, adId, websiteId] = tx_ref.split('-');
//     if (!adId || !websiteId) {
//       return res.redirect('https://yepper.cc/approved-ads?status=invalid-txref');
//     }

//     // Verify the transaction with Flutterwave
//     const transactionVerification = await axios.get(
//       `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
//           'Content-Type': 'application/json'
//         },
//       }
//     );

//     const { status, amount, currency } = transactionVerification.data.data;

//     // Find the payment record
//     const payment = await Payment.findOne({ tx_ref });

//     if (!payment) {
//       console.error('Payment record not found for tx_ref:', tx_ref);
//       return res.redirect('https://yepper.cc/approved-ads?status=payment-not-found');
//     }

//     // Verify payment amount and currency
//     if (payment.amount !== amount || payment.currency !== currency) {
//       console.error('Payment amount or currency mismatch');
//       payment.status = 'failed';
//       await payment.save();
//       return res.redirect('https://yepper.cc/approved-ads?status=amount-mismatch');
//     }

//     if (status === 'successful') {
//       // Start transaction
//       await session.startTransaction();
//       transactionStarted = true;

//       // Find the ad and its categories first
//       const ad = await ImportAd.findOne({ _id: adId }).session(session);
//       if (!ad) {
//         throw new Error('Advertisement not found');
//       }

//       const websiteSelection = ad.websiteSelections.find(
//         sel => sel.websiteId.toString() === websiteId.toString()
//       );

//       if (!websiteSelection) {
//         throw new Error('Website selection not found');
//       }

//       // Find all relevant categories first
//       const categories = await AdCategory.find({
//         _id: { $in: websiteSelection.categories },
//         websiteId: websiteId
//       }).session(session);

//       if (!categories.length) {
//         throw new Error('No valid categories found');
//       }

//       // Update the ad status
//       const updatedAd = await ImportAd.findOneAndUpdate(
//         { 
//           _id: adId,
//           'websiteSelections': {
//             $elemMatch: {
//               websiteId: websiteId,
//               approved: true,
//               confirmed: { $ne: true }
//             }
//           }
//         },
//         { 
//           $set: { 
//             'websiteSelections.$.confirmed': true,
//             'websiteSelections.$.confirmedAt': new Date()
//           }
//         },
//         { 
//           new: true,
//           session 
//         }
//       );

//       if (!updatedAd) {
//         throw new Error('Failed to update ad confirmation status');
//       }

//       // Update categories
//       await AdCategory.updateMany(
//         { 
//           _id: { $in: websiteSelection.categories },
//           websiteId: websiteId
//         },
//         { $addToSet: { selectedAds: updatedAd._id } },
//         { session }
//       );

//       // Update web owner's balance
//       await WebOwnerBalance.findOneAndUpdate(
//         { userId: payment.webOwnerId },
//         {
//           $inc: {
//             totalEarnings: payment.amount,
//             availableBalance: payment.amount
//           }
//         },
//         { upsert: true, session }
//       );

//       // Create payment trackers for each category
//       const paymentTrackers = categories.map(category => ({
//         userId: payment.webOwnerId,
//         adId: ad._id,
//         categoryId: category._id,
//         paymentDate: new Date(),
//         amount: amount / categories.length, // Split amount across categories
//         viewsRequired: category.visitorRange.max,
//         currentViews: 0,
//         status: 'pending'
//       }));

//       await PaymentTracker.insertMany(paymentTrackers, { session });
      
//       // Update payment status
//       payment.status = 'successful';
//       await payment.save({ session });

//       await session.commitTransaction();
//       transactionStarted = false;

//       return res.redirect('https://yepper.cc/approved-ads?status=success');
//     } else {
//       payment.status = 'failed';
//       await payment.save();
//       return res.redirect('https://yepper.cc/approved-ads?status=failed');
//     }
//   } catch (error) {
//     console.error('Error handling payment callback:', error);
//     if (transactionStarted) {
//       await session.abortTransaction();
//     }
//     return res.redirect('https://yepper.cc/approved-ads?status=error');
//   } finally {
//     await session.endSession();
//   }
// };

exports.initiateAdPayment = async (req, res) => {
  try {
    const { adId, websiteId, amount, email, phoneNumber, userId } = req.body;

    // Input validation
    if (!adId || !websiteId || !amount || !email || !userId) {
      return res.status(400).json({ 
        message: 'Missing required fields', 
        required: ['adId', 'websiteId', 'amount', 'email', 'userId'] 
      });
    }

    // Validate amount
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount provided' });
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
      return res.status(400).json({ message: 'Ad is already confirmed for this website' });
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
      return res.status(404).json({ message: 'Ad not found or not approved for this website' });
    }

    // Get website selection and verify categories
    const websiteSelection = ad.websiteSelections.find(
      selection => selection.websiteId.toString() === websiteId.toString()
    );

    if (!websiteSelection || !websiteSelection.categories?.length) {
      return res.status(400).json({ message: 'Invalid website selection or no categories selected' });
    }

    // Verify categories exist
    const categories = await AdCategory.find({
      _id: { $in: websiteSelection.categories },
      websiteId: websiteId
    });

    if (!categories.length) {
      return res.status(404).json({ message: 'Categories not found for this website' });
    }

    // Generate unique transaction reference
    const tx_ref = `AD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create payment record first
    const payment = new Payment({
      tx_ref,
      amount: numericAmount,
      currency: 'USD',
      email,
      userId,
      adId,
      websiteId, // Add the missing websiteId field
      webOwnerId: categories[0].ownerId,
      status: 'pending'
    });

    await payment.save();

    // Construct clean Flutterwave payment payload
    const paymentPayload = {
      tx_ref,
      amount: numericAmount,
      currency: 'USD',
      redirect_url: `${process.env.BASE_URL || 'https://yepper-backend.onrender.com'}/api/accept/callback`,
      payment_options: 'card',
      meta: {
        adId: adId.toString(),
        websiteId: websiteId.toString(),
        userId: userId.toString()
      },
      customer: {
        email: email.trim(),
        name: ad.businessName || 'Ad Customer',
        // Add phone number if provided
        ...(phoneNumber && { phone_number: phoneNumber })
      },
      customizations: {
        title: 'Ad Space Payment',
        description: `Payment for ad space - ${ad.businessName}`,
        logo: process.env.COMPANY_LOGO_URL || ''
      }
    };

    console.log('Clean Flutterwave payload:', JSON.stringify(paymentPayload, null, 2));

    // Validate environment variables
    if (!process.env.FLW_SECRET_KEY) {
      throw new Error('Flutterwave secret key not configured');
    }

    // Make request to Flutterwave with proper error handling
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments', 
      paymentPayload, 
      {
        headers: { 
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    console.log('Flutterwave response:', response.data);

    if (response.data?.status === 'success' && response.data?.data?.link) {
      res.status(200).json({ 
        success: true,
        paymentLink: response.data.data.link,
        tx_ref,
        message: 'Payment link generated successfully'
      });
    } else {
      throw new Error(`Invalid payment response: ${JSON.stringify(response.data)}`);
    }

  } catch (error) {
    console.error('Payment initiation error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // Clean up failed payment record
    if (error.response?.status >= 400) {
      try {
        const { tx_ref } = req.body;
        if (tx_ref) {
          await Payment.findOneAndDelete({ tx_ref });
        }
      } catch (deleteError) {
        console.error('Error deleting failed payment record:', deleteError.message);
      }
    }

    // Return specific error messages
    let errorMessage = 'Error initiating payment';
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
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.adPaymentCallback = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    const { tx_ref, transaction_id, status: queryStatus } = req.query;
    
    console.log('Payment callback received:', { tx_ref, transaction_id, queryStatus });

    if (!tx_ref || !transaction_id) {
      console.error('Missing required callback parameters');
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=invalid-params`);
    }

    // Find the payment record first
    const payment = await Payment.findOne({ tx_ref });
    if (!payment) {
      console.error('Payment record not found for tx_ref:', tx_ref);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=payment-not-found`);
    }

    // Verify the transaction with Flutterwave
    const transactionVerification = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const transactionData = transactionVerification.data.data;
    const { status, amount, currency, tx_ref: verifiedTxRef } = transactionData;

    console.log('Transaction verification result:', { status, amount, currency, verifiedTxRef });

    // Verify transaction reference matches
    if (verifiedTxRef !== tx_ref) {
      console.error('Transaction reference mismatch');
      payment.status = 'failed';
      await payment.save();
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=tx-ref-mismatch`);
    }

    // Verify payment amount and currency
    if (Math.abs(payment.amount - amount) > 0.01 || payment.currency !== currency) {
      console.error('Payment amount or currency mismatch:', {
        expected: { amount: payment.amount, currency: payment.currency },
        received: { amount, currency }
      });
      payment.status = 'failed';
      await payment.save();
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=amount-mismatch`);
    }

    if (status === 'successful') {
      // Start transaction
      await session.startTransaction();
      transactionStarted = true;

      // Process successful payment
      await processSuccessfulPayment(payment, session);
      
      // Update payment status
      payment.status = 'successful';
      await payment.save({ session });

      await session.commitTransaction();
      transactionStarted = false;

      console.log('Payment processed successfully for tx_ref:', tx_ref);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=success`);
      
    } else {
      payment.status = 'failed';
      await payment.save();
      console.log('Payment failed for tx_ref:', tx_ref, 'Status:', status);
      return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=failed`);
    }

  } catch (error) {
    console.error('Payment callback error:', error.message);
    
    if (transactionStarted) {
      await session.abortTransaction();
    }
    
    return res.redirect(`${process.env.FRONTEND_URL || 'https://yepper.cc'}/approved-ads?status=error`);
  } finally {
    await session.endSession();
  }
};

// Helper function to process successful payment
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
        'websiteSelections.$.confirmedAt': new Date()
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
      }
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
    paymentReference: payment.tx_ref
  }));

  await PaymentTracker.insertMany(paymentTrackers, { session });
}

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

exports.updateWebOwnerBalance = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || userId.trim() === '') {
      return res.status(400).json({ message: 'User ID is required.' });
    }

    const balanceRecord = await WebOwnerBalance.findOneAndUpdate(
      { userId },
      { $inc: { totalEarnings: amount, availableBalance: amount } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({ message: 'Balance updated successfully.', balance: balanceRecord });
  } catch (error) {
    console.error('Error updating balance:', error);
    res.status(500).json({ message: 'Error updating balance.', error: error.message });
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

    // Input validation
    try {
      WithdrawalService.validateWithdrawalInput(amount, phoneNumber, userId);
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    // Check if user has sufficient balance
    const balance = await WebOwnerBalance.findOne({ userId });
    if (!balance || balance.availableBalance < amount) {
      return res.status(400).json({ 
        message: 'Insufficient balance',
        currentBalance: balance?.availableBalance || 0
      });
    }

    // Prepare transfer payload
    const transferPayload = WithdrawalService.prepareTransferPayload(phoneNumber, amount, userId);

    try {
      // Initiate transfer via Flutterwave
      const response = await axios.post('https://api.flutterwave.com/v3/transfers', transferPayload, {
        headers: { 
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      // Create withdrawal record
      const withdrawal = new Withdrawal({
        userId,
        amount,
        phoneNumber,
        status: response.data.status === 'success' ? 'processing' : 'failed',
        transactionId: response.data.data?.id,
      });
      await withdrawal.save({ session });

      if (response.data.status === 'success') {
        // Update user's available balance
        await WebOwnerBalance.findOneAndUpdate(
          { userId },
          { $inc: { availableBalance: -amount } },
          { session }
        );

        // Update payment tracker status
        await PaymentTracker.findByIdAndUpdate(
          paymentId,
          {
            lastWithdrawalDate: new Date(),
            status: 'withdrawn'
          },
          { session }
        );

        await session.commitTransaction();
        
        return res.status(200).json({
          message: 'Withdrawal initiated successfully',
          reference: transferPayload.reference,
          withdrawal
        });
      } else {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'Failed to initiate transfer',
          error: response.data 
        });
      }
    } catch (transferError) {
      await session.abortTransaction();
      console.error('Transfer error:', transferError);
      
      return res.status(500).json({ 
        message: 'Error processing transfer',
        error: transferError.response?.data || transferError.message
      });
    }
  } catch (error) {
    await session.abortTransaction();
    console.error('Withdrawal error:', error);
    res.status(500).json({ 
      message: 'Error processing withdrawal',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

exports.withdrawalCallback = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { data } = req.body;
    const withdrawal = await Withdrawal.findOne({ transactionId: data.id });

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    if (data.status === 'successful') {
      withdrawal.status = 'completed';
    } else {
      withdrawal.status = 'failed';
      withdrawal.failureReason = data.complete_message;
      
      // Refund the amount back to available balance
      await WebOwnerBalance.findOneAndUpdate(
        { userId: withdrawal.userId },
        { $inc: { availableBalance: withdrawal.amount } },
        { session }
      );
    }

    await withdrawal.save({ session });
    await session.commitTransaction();
    
    res.status(200).json({ message: 'Callback processed successfully' });
  } catch (error) {
    await session.abortTransaction();
    console.error('Withdrawal callback error:', error);
    res.status(500).json({ 
      message: 'Error processing callback',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};