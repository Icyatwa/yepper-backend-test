// PaymentController.js — Flutterwave integration (MoMo + Card, sandbox)
const crypto = require('crypto');
const axios = require('axios');
const User = require('../../models/User');
const Payment = require('../models/PaymentModel');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/walletModel');
const mongoose = require('mongoose');

// ─── Flutterwave helpers ───────────────────────────────────────────────────
const FLW_TEST_MODE = process.env.FLUTTERWAVE_TEST_MODE !== 'false'; // default sandbox

const FLW_TEST_SECRET_KEY = FLW_TEST_MODE
  ? process.env.FLW_TEST_SECRET_KEY
  : process.env.FLW_TEST_SECRET_KEY;

const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

const flwHeaders = () => ({
  Authorization: `Bearer ${FLW_TEST_SECRET_KEY}`,
  'Content-Type': 'application/json',
});

/**
 * Create a Flutterwave standard payment link.
 * Supports both card and Mobile Money (MoMo) — Flutterwave's hosted checkout
 * lets the customer pick their method (card, MTN MoMo, Airtel Money, etc.)
 * when payment_options is omitted or set to 'card,mobilemoney'.
 */
const createFlutterwaveLink = async ({
  tx_ref,
  amount,
  currency = 'RWF',
  customer,
  description,
  redirect_url,
  payment_options = 'card,mobilemoney', // card + MoMo in one checkout
}) => {
  if (!FLW_TEST_SECRET_KEY) {
    throw new Error(
      'Flutterwave secret key is not set. ' +
        'Add FLW_TEST_SECRET_KEY (sandbox) or FLW_TEST_SECRET_KEY (live) to your environment.'
    );
  }

  console.log(
    `[Flutterwave] createLink — mode=${FLW_TEST_MODE ? 'SANDBOX' : 'LIVE'} ` +
      `amount=${amount} ${currency} ref=${tx_ref}`
  );

  let response;
  try {
    response = await axios.post(
      `${FLW_BASE_URL}/payments`,
      {
        tx_ref,
        amount,
        currency,
        redirect_url,
        payment_options,
        customer: {
          email: customer.email,
          name: customer.name,
        },
        customizations: {
          title: 'Yepper Ads',
          description,
          logo: process.env.BRAND_LOGO_URL || '',
        },
        meta: {
          source: 'yepper',
          sandbox: FLW_TEST_MODE,
        },
      },
      { headers: flwHeaders(), timeout: 30000 }
    );
  } catch (axiosErr) {
    console.error('[Flutterwave] API call failed:', {
      status: axiosErr.response?.status,
      data: axiosErr.response?.data,
      message: axiosErr.message,
    });
    throw new Error(
      axiosErr.response?.data?.message ||
        `Flutterwave API error (${axiosErr.response?.status ?? 'network'}): ${axiosErr.message}`
    );
  }

  if (response.data.status === 'success') {
    const url = response.data.data?.link;
    console.log('[Flutterwave] payment link created:', url);
    return url;
  }
  throw new Error(
    `Flutterwave link creation failed: ${response.data.message || 'Unknown error'}`
  );
};

/**
 * Verify a Flutterwave transaction by transaction_id (numeric) or tx_ref.
 * Prefer transaction_id (more reliable). Falls back to tx_ref search.
 */
const verifyFlutterwaveTransaction = async (identifier) => {
  // identifier could be a numeric transaction_id or a tx_ref string
  const isNumericId = /^\d+$/.test(String(identifier));

  if (isNumericId) {
    const response = await axios.get(
      `${FLW_BASE_URL}/transactions/${identifier}/verify`,
      { headers: flwHeaders(), timeout: 30000 }
    );
    return response.data; // { status, message, data: { status, amount, currency, tx_ref, id, ... } }
  }

  // tx_ref search
  const response = await axios.get(
    `${FLW_BASE_URL}/transactions`,
    {
      params: { tx_ref: identifier },
      headers: flwHeaders(),
      timeout: 30000,
    }
  );

  if (
    response.data.status === 'success' &&
    Array.isArray(response.data.data) &&
    response.data.data.length > 0
  ) {
    // Return in same shape as single-verify response
    return { status: 'success', data: response.data.data[0] };
  }

  return { status: 'error', data: null };
};

// ─── Retry helper ──────────────────────────────────────────────────────────
const retryTransaction = async (operation, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(operation, {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
        maxCommitTimeMS: 30000,
      });
      await session.endSession();
      return result;
    } catch (error) {
      await session.endSession();
      if (
        error.hasErrorLabel &&
        error.hasErrorLabel('TransientTransactionError') &&
        attempt < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Transaction failed (attempt ${attempt}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
};

const generateUniqueTransactionRef = (prefix, userId, additionalData = '') => {
  const timestamp = Date.now();
  const nanoTime = process.hrtime.bigint().toString();
  const random = crypto.randomBytes(8).toString('hex');
  const counter = Math.floor(Math.random() * 9999);
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}_${additionalData}_${timestamp}_${nanoTime}_${random}_${counter}`)
    .digest('hex')
    .substring(0, 12);
  return `${prefix}_${userId}_${hash}_${timestamp}_${counter}`;
};

// ─── initiatePayment (bulk) ────────────────────────────────────────────────
exports.initiatePayment = async (req, res) => {
  try {
    const { adId, selections } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'At least one ad placement must be selected' });
    }

    const ad = await ImportAd.findById(adId);
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    if (ad.userId.toString() !== userId.toString())
      return res.status(403).json({ error: 'Unauthorized access to ad' });

    let totalAmount = 0;
    const validatedSelections = [];
    const categoryDetails = [];

    for (const selection of selections) {
      const { websiteId, categoryId } = selection;
      const existing = ad.websiteSelections.find(
        (sel) =>
          sel.websiteId.toString() === websiteId &&
          sel.categories.includes(categoryId) &&
          sel.status === 'active'
      );
      if (existing) continue;

      const category = await AdCategory.findById(categoryId);
      const website = await Website.findById(websiteId);
      if (!category || !website) {
        return res
          .status(404)
          .json({ error: `Category or website not found for: ${categoryId}` });
      }

      totalAmount += category.price;
      validatedSelections.push({
        websiteId,
        categoryId,
        webOwnerId: website.ownerId,
        price: category.price,
        categoryName: category.categoryName,
        websiteName: website.websiteName,
      });
      categoryDetails.push({
        categoryName: category.categoryName,
        websiteName: website.websiteName,
        price: category.price,
        webOwnerId: website.ownerId,
      });
    }

    if (validatedSelections.length === 0) {
      return res
        .status(400)
        .json({ error: 'All selected placements are already paid for' });
    }

    const baseReference = `bulk_${adId}_${Date.now()}`;
    const tx_ref = `${baseReference}_flw`;

    const paymentUrl = await createFlutterwaveLink({
      tx_ref,
      amount: totalAmount,
      currency: 'RWF',
      redirect_url: `${process.env.FRONTEND_URL}/payment/callback`,
      customer: { email: ad.adOwnerEmail, name: ad.businessName },
      description: `Payment for ${validatedSelections.length} ad placement(s)`,
    });

    const paymentPromises = validatedSelections.map((selection, index) => {
      const payment = new Payment({
        paymentId: `${baseReference}_${index}`,
        tx_ref: index === 0 ? tx_ref : `${baseReference}_${index}`,
        baseReference,
        adId,
        advertiserId: userId,
        webOwnerId: selection.webOwnerId,
        websiteId: selection.websiteId,
        categoryId: selection.categoryId,
        amount: selection.price,
        currency: 'RWF',
        status: 'pending',
        flutterwaveData: index === 0 ? { paymentUrl } : {},
        metadata: {
          bulkPaymentIndex: index,
          totalInGroup: validatedSelections.length,
          isGroupPayment: true,
          categoryName: selection.categoryName,
          websiteName: selection.websiteName,
        },
      });
      return payment.save();
    });

    await Promise.all(paymentPromises);

    res.status(200).json({
      success: true,
      paymentUrl,
      baseReference,
      tx_ref,
      totalAmount,
      selectionsCount: validatedSelections.length,
      categoryDetails,
      sandboxMode: FLW_TEST_MODE,
    });
  } catch (error) {
    console.error('Bulk payment initiation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── verifyPayment ─────────────────────────────────────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { transaction_id, tx_ref } = req.body;
    const identifier = transaction_id || tx_ref;
    if (!identifier) return res.status(400).json({ error: 'Transaction ID or reference required' });

    const flwResponse = await verifyFlutterwaveTransaction(identifier);
    const flwData = flwResponse.data;

    if (flwResponse.status === 'success' && flwData?.status === 'successful') {
      let primaryPayment = await Payment.findOne({
        $or: [{ tx_ref: flwData.tx_ref || identifier }, { paymentId: String(flwData.id || identifier) }],
      });

      if (!primaryPayment) return res.status(404).json({ error: 'Payment record not found' });
      if (primaryPayment.status === 'successful') {
        return res
          .status(200)
          .json({ success: true, message: 'Payment already processed', payment: primaryPayment });
      }

      const allPayments = await Payment.find({
        baseReference: primaryPayment.baseReference,
      }).sort({ 'metadata.bulkPaymentIndex': 1 });

      const result = await retryTransaction(async (session) => {
        const payments = await Payment.find({
          baseReference: primaryPayment.baseReference,
        }).session(session);
        if (!payments || payments.length === 0)
          throw new Error('No payments found for this transaction');
        if (payments.every((p) => p.status === 'successful'))
          return { alreadyProcessed: true, payments };

        const ad = await ImportAd.findById(primaryPayment.adId).session(session);
        if (!ad) throw new Error('Ad not found');
        const advertiser = await User.findById(primaryPayment.advertiserId).session(session);
        if (!advertiser) throw new Error('Advertiser not found');

        const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

        await Wallet.findOneAndUpdate(
          { ownerId: primaryPayment.advertiserId, ownerType: 'advertiser' },
          {
            $inc: { totalSpent: totalAmount },
            $setOnInsert: {
              ownerId: primaryPayment.advertiserId,
              ownerEmail: advertiser.email,
              ownerType: 'advertiser',
              balance: 0,
              totalEarned: 0,
              totalRefunded: 0,
            },
            $set: { lastUpdated: new Date() },
          },
          { upsert: true, session }
        );

        const rejectionDeadline = new Date();
        rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);
        const webOwnerPayments = new Map();

        for (const payment of payments) {
          payment.status = 'successful';
          payment.paidAt = new Date();
          if (payment._id.equals(primaryPayment._id)) {
            payment.flutterwaveData = flwData;  // just assign the plain object directly
          }
          await payment.save({ session });

          const category = await AdCategory.findById(payment.categoryId).session(session);
          const website = await Website.findById(payment.websiteId).session(session);
          if (!category || !website) continue;

          const selIdx = ad.websiteSelections.findIndex(
            (sel) =>
              sel.websiteId.toString() === payment.websiteId.toString() &&
              sel.categories.includes(payment.categoryId)
          );
          if (selIdx !== -1) {
            ad.websiteSelections[selIdx].status = 'active';
            ad.websiteSelections[selIdx].approved = true;
            ad.websiteSelections[selIdx].approvedAt = new Date();
            ad.websiteSelections[selIdx].publishedAt = new Date();
            ad.websiteSelections[selIdx].paymentId = payment._id;
            ad.websiteSelections[selIdx].rejectionDeadline = rejectionDeadline;
          } else {
            ad.websiteSelections.push({
              websiteId: payment.websiteId,
              categories: [payment.categoryId],
              approved: true,
              approvedAt: new Date(),
              publishedAt: new Date(),
              paymentId: payment._id,
              status: 'active',
              rejectionDeadline,
            });
          }

          await AdCategory.findByIdAndUpdate(
            payment.categoryId,
            { $addToSet: { selectedAds: payment.adId } },
            { session }
          );

          const wId = payment.webOwnerId.toString();
          if (!webOwnerPayments.has(wId))
            webOwnerPayments.set(wId, {
              amount: 0,
              email: category.webOwnerEmail,
              ownerId: wId,
              payments: [],
            });
          const od = webOwnerPayments.get(wId);
          od.amount += payment.amount;
          od.payments.push(payment._id);
        }

        const anyApproved = ad.websiteSelections.some((sel) => sel.approved);
        if (anyApproved) ad.confirmed = true;
        await ad.save({ session });

        for (const [wId, info] of webOwnerPayments) {
          let ownerEmail = info.email;
          if (!ownerEmail) {
            const wo = await User.findById(wId).session(session);
            if (wo) ownerEmail = wo.email;
          }
          const ww = await Wallet.findOneAndUpdate(
            { ownerId: wId, ownerType: 'webOwner' },
            {
              $inc: { balance: info.amount, totalEarned: info.amount },
              $setOnInsert: {
                ownerId: wId,
                ownerEmail,
                ownerType: 'webOwner',
                totalSpent: 0,
                totalRefunded: 0,
              },
              $set: { lastUpdated: new Date() },
            },
            { upsert: true, new: true, session }
          );
          for (const pId of info.payments) {
            const pd = payments.find((p) => p._id.equals(pId));
            await new WalletTransaction({
              walletId: ww._id,
              paymentId: pId,
              adId: primaryPayment.adId,
              amount: pd.amount,
              type: 'credit',
              description: `Payment for ad: ${ad.businessName} - ${pd.metadata?.categoryName}`,
            }).save({ session });
          }
        }

        return { success: true, payments };
      });

      if (result.alreadyProcessed) {
        return res.status(200).json({
          success: true,
          message: 'Payment already processed',
          paymentsCount: result.payments?.length || allPayments.length,
        });
      }

      res.status(200).json({
        success: true,
        message: `Payment verified and ${result.payments?.length} ad placements published successfully`,
        paymentsProcessed: result.payments?.length,
      });
    } else {
      const failedPayment = await Payment.findOne({
        $or: [{ tx_ref: identifier }, { paymentId: String(identifier) }],
      });
      if (failedPayment?.baseReference) {
        await Payment.updateMany(
          { baseReference: failedPayment.baseReference },
          { status: 'failed', flutterwaveData: flwData }
        );
      }
      res
        .status(400)
        .json({ success: false, message: 'Payment verification failed', details: flwData });
    }
  } catch (error) {
    console.error('Bulk payment verification error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── verifyPaymentNonTransactional ─────────────────────────────────────────
exports.verifyPaymentNonTransactional = async (req, res) => {
  try {
    const { transaction_id, tx_ref } = req.body;
    const identifier = transaction_id || tx_ref;
    if (!identifier) return res.status(400).json({ error: 'Transaction ID or reference required' });

    const flwResponse = await verifyFlutterwaveTransaction(identifier);
    const flwData = flwResponse.data;

    if (flwResponse.status === 'success' && flwData?.status === 'successful') {
      let payment = await Payment.findOne({
        $or: [
          { tx_ref: flwData.tx_ref || identifier },
          { paymentId: String(flwData.id || identifier) },
        ],
      });
      if (!payment) return res.status(404).json({ error: 'Payment record not found' });
      if (payment.status === 'successful')
        return res
          .status(200)
          .json({ success: true, message: 'Payment already processed', payment });

      const updateResult = await Payment.findByIdAndUpdate(
        payment._id,
        {
          $set: {
            paymentId: String(flwData.id || identifier),
            status: 'successful',
            paidAt: new Date(),
            'flutterwaveData.verification': flwData,
          },
        },
        { new: true, runValidators: true }
      );

      if (!updateResult) return res.status(404).json({ error: 'Payment update failed' });

      try {
        const ad = await ImportAd.findById(payment.adId);
        if (ad) {
          const selIdx = ad.websiteSelections.findIndex(
            (sel) =>
              sel.websiteId.toString() === payment.websiteId.toString() &&
              sel.categories.includes(payment.categoryId)
          );
          const rejectionDeadline = new Date();
          rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);
          if (selIdx !== -1) {
            ad.websiteSelections[selIdx].status = 'active';
            ad.websiteSelections[selIdx].approved = true;
            ad.websiteSelections[selIdx].approvedAt = new Date();
            ad.websiteSelections[selIdx].publishedAt = new Date();
            ad.websiteSelections[selIdx].paymentId = payment._id;
            ad.websiteSelections[selIdx].rejectionDeadline = rejectionDeadline;
          } else {
            ad.websiteSelections.push({
              websiteId: payment.websiteId,
              categories: [payment.categoryId],
              approved: true,
              approvedAt: new Date(),
              publishedAt: new Date(),
              paymentId: payment._id,
              status: 'active',
              rejectionDeadline,
            });
          }
          if (ad.websiteSelections.some((s) => s.approved)) ad.confirmed = true;
          await ad.save();
        }
        await AdCategory.findByIdAndUpdate(payment.categoryId, {
          $addToSet: { selectedAds: payment.adId },
        });

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
                totalRefunded: 0,
              },
              $set: { lastUpdated: new Date() },
            },
            { upsert: true }
          );
        }

        const category = await AdCategory.findById(payment.categoryId);
        let ownerEmail = category?.webOwnerEmail;
        if (!ownerEmail) {
          const wo = await User.findById(payment.webOwnerId);
          ownerEmail = wo?.email;
        }
        if (ownerEmail) {
          const ww = await Wallet.findOneAndUpdate(
            { ownerId: payment.webOwnerId, ownerType: 'webOwner' },
            {
              $inc: { balance: payment.amount, totalEarned: payment.amount },
              $setOnInsert: {
                ownerId: payment.webOwnerId,
                ownerEmail,
                ownerType: 'webOwner',
                totalSpent: 0,
                totalRefunded: 0,
              },
              $set: { lastUpdated: new Date() },
            },
            { upsert: true, new: true }
          );
          if (ww) {
            await new WalletTransaction({
              walletId: ww._id,
              paymentId: payment._id,
              adId: payment.adId,
              amount: payment.amount,
              type: 'credit',
              description: `Payment for ad: ${ad?.businessName || 'Unknown'} on category: ${category?.categoryName || 'Unknown'}`,
            }).save();
          }
        }
      } catch (updateError) {
        console.error('Post-payment update error:', updateError);
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified and ad published successfully',
        payment: updateResult,
      });
    } else {
      await Payment.findOneAndUpdate(
        { $or: [{ tx_ref: identifier }, { paymentId: String(identifier) }] },
        { status: 'failed', flutterwaveData: flwData }
      );
      res
        .status(400)
        .json({ success: false, message: 'Payment verification failed', details: flwData });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── generateFlutterwavePaymentUrl ────────────────────────────────────────
exports.generateFlutterwavePaymentUrl = async (paymentData) => {
  try {
    if (!FLW_TEST_SECRET_KEY)
      throw new Error('Flutterwave API key not configured. Please contact support.');

    console.log(`Using Flutterwave in ${FLW_TEST_MODE ? 'SANDBOX' : 'LIVE'} mode`);

    const frontendUrl = process.env.FRONTEND_URL || 'https://yepper.cc';

    const url = await createFlutterwaveLink({
      tx_ref: paymentData.tx_ref,
      amount: paymentData.amount,
      currency: 'RWF',
      redirect_url: `${frontendUrl}/payment-callback2`,
      customer: paymentData.customer,
      description: paymentData.customizations?.description || 'Ad payment',
    });

    return url;
  } catch (error) {
    console.error(
      'Flutterwave payment URL generation error:',
      error.response?.data || error.message
    );
    if (error.response?.status === 401)
      throw new Error('Flutterwave authentication failed. Please contact support.');
    if (error.response?.status === 400)
      throw new Error(
        'Invalid payment data. Please check your information and try again.'
      );
    throw new Error('Payment URL generation failed. Please try again later.');
  }
};

// Alias so any code referencing generateXentriPayPaymentUrl keeps working
exports.generateXentriPayPaymentUrl = exports.generateFlutterwavePaymentUrl;

// ─── handleProcessWallet ───────────────────────────────────────────────────
exports.handleProcessWallet = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { selections, isReassignment = false } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'No selections provided' });
    }

    const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
    const walletBalance = wallet ? wallet.balance : 0;

    let totalCost = 0;
    const processedSelections = [];

    for (const selection of selections) {
      const ad = await ImportAd.findById(selection.adId);
      const category = await AdCategory.findById(selection.categoryId);
      const website = await Website.findById(selection.websiteId);

      if (!ad) return res.status(404).json({ error: 'Ad not found', adId: selection.adId });
      if (!category)
        return res.status(404).json({ error: 'Category not found', categoryId: selection.categoryId });
      if (!website)
        return res.status(404).json({ error: 'Website not found', websiteId: selection.websiteId });
      if (ad.userId !== userId)
        return res.status(403).json({ error: 'Unauthorized access to ad', adId: selection.adId });

      const maxAds = category.userCount || 10;
      if ((category.selectedAds?.length || 0) >= maxAds) {
        return res.status(409).json({
          error: 'Category fully booked',
          message: `Category "${category.categoryName}" is fully booked.`,
          categoryName: category.categoryName,
        });
      }

      const price = parseFloat(category.price) || 0;
      totalCost += price;
      processedSelections.push({ ...selection, ad, category, website, price });
    }

    const buildPaymentUrl = async (amount, baseRef, customerEmail, customerName, desc) => {
      return await exports.generateFlutterwavePaymentUrl({
        tx_ref: baseRef,
        amount,
        customer: { email: customerEmail, name: customerName || 'User' },
        customizations: { description: desc },
      });
    };

    if (isReassignment && walletBalance < totalCost) {
      const walletToUse = Math.min(walletBalance, totalCost);
      const remainingAmount = totalCost - walletToUse;
      const baseHybridRef = generateUniqueTransactionRef(
        'hybrid_reassignment_base',
        userId,
        `${selections.length}_${totalCost}_${Date.now()}`
      );

      await session.withTransaction(async () => {
        for (let i = 0; i < processedSelections.length; i++) {
          const sel = processedSelections[i];
          const individualTxRef = generateUniqueTransactionRef(
            'hybrid_reassignment_item',
            userId,
            `${sel.adId}_${sel.categoryId}_${i}_${baseHybridRef}_${Date.now()}_${Math.random()}`
          );
          await new Payment({
            advertiserId: userId,
            tx_ref: individualTxRef,
            baseReference: baseHybridRef,
            amount: sel.price,
            paymentType: 'hybrid_reassignment',
            status: 'pending',
            adId: sel.adId,
            websiteId: sel.websiteId,
            categoryId: sel.categoryId,
            webOwnerId: sel.category.ownerId,
            paymentId: `pending_${individualTxRef}`,
            isReassignment: true,
            walletApplied: walletToUse * (sel.price / totalCost),
            refundApplied: 0,
            amountPaid: remainingAmount * (sel.price / totalCost),
            metadata: {
              selectionIndex: i,
              totalSelections: processedSelections.length,
              hybridPayment: true,
              baseReference: baseHybridRef,
            },
          }).save({ session });
        }
      });

      const paymentUrl = await buildPaymentUrl(
        remainingAmount,
        baseHybridRef,
        req.user.email,
        req.user.name,
        `Reassignment payment for ${processedSelections.length} categories`
      );

      return res.status(200).json({
        success: true,
        allPaid: false,
        message: `${walletToUse.toFixed(2)} from wallet. Pay ${remainingAmount.toFixed(2)} via card/MoMo.`,
        summary: {
          totalCost,
          walletUsed: walletToUse,
          cardAmount: remainingAmount,
          refundUsed: 0,
          isReassignment: true,
        },
        paymentUrl,
        tx_ref: baseHybridRef,
        paymentCount: processedSelections.length,
      });
    }

    if (!isReassignment && walletBalance < totalCost) {
      const availableRefunds = await Payment.getAllAvailableRefunds(userId);
      const walletToUse = Math.min(walletBalance, totalCost);
      const remainingAfterWallet = totalCost - walletToUse;
      const refundToUse = Math.min(availableRefunds, remainingAfterWallet);
      const remainingAmount = remainingAfterWallet - refundToUse;
      const baseHybridRef = generateUniqueTransactionRef(
        'hybrid_base',
        userId,
        `${selections.length}_${totalCost}_${Date.now()}`
      );

      await session.withTransaction(async () => {
        for (let i = 0; i < processedSelections.length; i++) {
          const sel = processedSelections[i];
          const individualTxRef = generateUniqueTransactionRef(
            'hybrid_item',
            userId,
            `${sel.adId}_${sel.categoryId}_${i}_${baseHybridRef}_${Date.now()}_${Math.random()}`
          );
          await new Payment({
            advertiserId: userId,
            tx_ref: individualTxRef,
            baseReference: baseHybridRef,
            amount: sel.price,
            paymentType: 'hybrid',
            status: 'pending',
            adId: sel.adId,
            websiteId: sel.websiteId,
            categoryId: sel.categoryId,
            webOwnerId: sel.category.ownerId,
            paymentId: `pending_${individualTxRef}`,
            isReassignment: false,
            walletApplied: walletToUse * (sel.price / totalCost),
            refundApplied: refundToUse * (sel.price / totalCost),
            amountPaid: remainingAmount * (sel.price / totalCost),
            metadata: {
              selectionIndex: i,
              totalSelections: processedSelections.length,
              hybridPayment: true,
              baseReference: baseHybridRef,
            },
          }).save({ session });
        }
      });

      const paymentUrl = await buildPaymentUrl(
        remainingAmount,
        baseHybridRef,
        req.user.email,
        req.user.name,
        `Payment for ${processedSelections.length} categories`
      );

      return res.status(200).json({
        success: true,
        allPaid: false,
        message: `${(walletToUse + refundToUse).toFixed(2)} applied from wallet/refunds. Pay ${remainingAmount.toFixed(2)} via card/MoMo.`,
        summary: {
          totalCost,
          walletUsed: walletToUse,
          cardAmount: remainingAmount,
          refundUsed: refundToUse,
          isReassignment: false,
        },
        paymentUrl,
        tx_ref: baseHybridRef,
        paymentCount: processedSelections.length,
      });
    }

    // Full wallet payment
    const baseWalletRef = generateUniqueTransactionRef(
      isReassignment ? 'wallet_reassignment_base' : 'wallet_base',
      userId,
      `${selections.length}_${totalCost}_${Date.now()}`
    );

    await session.withTransaction(async () => {
      await Wallet.findOneAndUpdate(
        { ownerId: userId, ownerType: 'advertiser' },
        { $inc: { balance: -totalCost, totalSpent: totalCost }, lastUpdated: new Date() },
        { session }
      );

      for (let i = 0; i < processedSelections.length; i++) {
        const sel = processedSelections[i];
        const individualTxRef = generateUniqueTransactionRef(
          isReassignment ? 'wallet_reassignment_item' : 'wallet_item',
          userId,
          `${sel.adId}_${sel.categoryId}_${i}_${baseWalletRef}_${Date.now()}_${Math.random()}`
        );

        await new Payment({
          advertiserId: userId,
          tx_ref: individualTxRef,
          baseReference: baseWalletRef,
          amount: sel.price,
          paymentType: isReassignment ? 'wallet_reassignment' : 'wallet',
          status: 'successful',
          adId: sel.adId,
          websiteId: sel.websiteId,
          categoryId: sel.categoryId,
          webOwnerId: sel.category.ownerId,
          paymentId: individualTxRef,
          isReassignment,
          walletApplied: sel.price,
          refundApplied: 0,
          amountPaid: 0,
          paidAt: new Date(),
          metadata: {
            selectionIndex: i,
            totalSelections: processedSelections.length,
            fullWalletPayment: true,
            baseReference: baseWalletRef,
          },
        }).save({ session });

        await ImportAd.findOneAndUpdate(
          {
            _id: sel.adId,
            'websiteSelections.websiteId': sel.websiteId,
            'websiteSelections.categories': sel.categoryId,
          },
          {
            $set: {
              'websiteSelections.$.approved': true,
              'websiteSelections.$.approvedAt': new Date(),
              'websiteSelections.$.status': 'active',
              'websiteSelections.$.publishedAt': new Date(),
            },
          },
          { session }
        );
        await AdCategory.findByIdAndUpdate(
          sel.categoryId,
          { $addToSet: { selectedAds: sel.adId } },
          { session }
        );
        await Wallet.findOneAndUpdate(
          { ownerId: sel.category.ownerId, ownerType: 'webOwner' },
          {
            $inc: { balance: sel.price, totalEarned: sel.price },
            lastUpdated: new Date(),
          },
          { session, upsert: true }
        );
      }
    });

    const updatedWallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
    res.status(200).json({
      success: true,
      allPaid: true,
      message: `All payments processed using wallet balance. Remaining: ${updatedWallet.balance.toFixed(2)}`,
      summary: {
        totalCost,
        walletUsed: totalCost,
        cardAmount: 0,
        refundUsed: 0,
        isReassignment,
        remainingBalance: updatedWallet.balance,
      },
      tx_ref: baseWalletRef,
      paymentCount: processedSelections.length,
    });
  } catch (error) {
    console.error('Handle process wallet error:', error);
    let errorMessage = 'Wallet payment failed';
    let statusCode = 500;
    if (error.code === 11000 && error.keyPattern?.tx_ref) {
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
    res.status(statusCode).json({ error: errorMessage, message: error.message });
  } finally {
    await session.endSession();
  }
};

// ─── calculatePaymentBreakdown ─────────────────────────────────────────────
exports.calculatePaymentBreakdown = async (req, res) => {
  try {
    const { selections, isReassignment = false } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;
    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'No selections provided' });
    }

    const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
    const walletBalance = wallet ? wallet.balance : 0;
    const availableRefunds = isReassignment
      ? 0
      : await Payment.getAllAvailableRefunds(userId);

    let totalCost = 0;
    const categoryDetails = [];

    for (const selection of selections) {
      const category = await AdCategory.findById(selection.categoryId);
      const website = await Website.findById(selection.websiteId);
      if (category && website) {
        const price = parseFloat(category.price) || 0;
        totalCost += price;
        categoryDetails.push({
          ...selection,
          price,
          categoryName: category.categoryName,
          websiteName: website.websiteName,
        });
      }
    }

    let paidFromWallet = 0,
      paidFromRefunds = 0,
      needsExternalPayment = 0;
    if (isReassignment) {
      paidFromWallet = Math.min(walletBalance, totalCost);
      needsExternalPayment = Math.max(0, totalCost - walletBalance);
    } else {
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

    let rw = paidFromWallet,
      rr = isReassignment ? 0 : paidFromRefunds,
      re = needsExternalPayment;
    const breakdown = categoryDetails.map((cat) => {
      let wu = 0,
        ru = 0,
        en = 0;
      if (rw >= cat.price) {
        wu = cat.price;
        rw -= cat.price;
      } else if (rw > 0) {
        wu = rw;
        const sn = cat.price - rw;
        rw = 0;
        if (!isReassignment && rr >= sn) {
          ru = sn;
          rr -= sn;
        } else if (!isReassignment && rr > 0) {
          ru = rr;
          en = sn - rr;
          rr = 0;
          re -= en;
        } else {
          en = sn;
          re -= en;
        }
      } else if (!isReassignment && rr >= cat.price) {
        ru = cat.price;
        rr -= cat.price;
      } else if (!isReassignment && rr > 0) {
        ru = rr;
        en = cat.price - rr;
        rr = 0;
        re -= en;
      } else {
        en = cat.price;
        re -= en;
      }
      return {
        ...cat,
        walletUsed: wu,
        refundUsed: isReassignment ? 0 : ru,
        externalPayment: en,
        paymentMethod:
          en > 0
            ? 'flutterwave'
            : ru > 0 && !isReassignment
            ? 'refund_or_wallet'
            : 'wallet',
      };
    });

    res.status(200).json({
      success: true,
      breakdown,
      summary: {
        totalCost,
        walletBalance,
        availableRefunds: isReassignment ? 0 : availableRefunds,
        paidFromWallet,
        paidFromRefunds: isReassignment ? 0 : paidFromRefunds,
        needsExternalPayment,
        canAffordAll: needsExternalPayment === 0,
        isReassignment,
        paymentGateway: 'Flutterwave',
        sandboxMode: FLW_TEST_MODE,
        paymentRestrictions: isReassignment
          ? 'Wallet and card/MoMo payments only (no refunds)'
          : 'All payment methods available',
      },
    });
  } catch (error) {
    console.error('Payment breakdown calculation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── completeAdPlacement ───────────────────────────────────────────────────
exports.completeAdPlacement = async (adId, websiteId, categoryId, paymentId, session) => {
  const ad = await ImportAd.findById(adId).session(session);
  const category = await AdCategory.findById(categoryId).session(session);
  const website = await Website.findById(websiteId).session(session);
  const selIdx = ad.websiteSelections.findIndex(
    (sel) =>
      sel.websiteId.toString() === websiteId && sel.categories.includes(categoryId)
  );
  const rejectionDeadline = new Date();
  rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

  if (selIdx !== -1) {
    Object.assign(ad.websiteSelections[selIdx], {
      status: 'active',
      approved: true,
      approvedAt: new Date(),
      publishedAt: new Date(),
      paymentId,
      rejectionDeadline,
      isRejected: false,
    });
  } else {
    ad.websiteSelections.push({
      websiteId,
      categories: [categoryId],
      approved: true,
      approvedAt: new Date(),
      publishedAt: new Date(),
      paymentId,
      status: 'active',
      rejectionDeadline,
      isRejected: false,
    });
  }
  ad.availableForReassignment = false;
  await ad.save({ session });
  await AdCategory.findByIdAndUpdate(
    categoryId,
    { $addToSet: { selectedAds: adId } },
    { session }
  );

  let webOwnerWallet = await Wallet.findOne({
    ownerId: website.ownerId,
    ownerType: 'webOwner',
  }).session(session);
  if (!webOwnerWallet)
    webOwnerWallet = new Wallet({
      ownerId: website.ownerId,
      ownerEmail: category.webOwnerEmail,
      ownerType: 'webOwner',
      balance: 0,
      totalEarned: 0,
    });
  webOwnerWallet.balance += category.price;
  webOwnerWallet.totalEarned += category.price;
  webOwnerWallet.lastUpdated = new Date();
  await webOwnerWallet.save({ session });
  await new WalletTransaction({
    walletId: webOwnerWallet._id,
    paymentId,
    adId,
    amount: category.price,
    type: 'credit',
    description: `Payment for ad: ${ad.businessName} on category: ${category.categoryName}`,
  }).save({ session });
};

// ─── initiatePaymentWithRefund ─────────────────────────────────────────────
exports.initiatePaymentWithRefund = async (req, res) => {
  try {
    const {
      adId,
      websiteId,
      categoryId,
      useRefundOnly = false,
      expectedRefund = 0,
      isReassignment = false,
    } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;
    const ad = await ImportAd.findById(adId);
    const category = await AdCategory.findById(categoryId);
    const website = await Website.findById(websiteId);
    if (!ad || !category || !website)
      return res.status(404).json({ error: 'Ad, category, or website not found' });
    if (ad.userId !== userId)
      return res.status(403).json({ error: 'Unauthorized access to ad' });
    const maxAds = category.userCount || 10;
    if ((category.selectedAds?.length || 0) >= maxAds)
      return res.status(409).json({ error: 'Category fully booked', isFullyBooked: true });
    if (isReassignment && (useRefundOnly || expectedRefund > 0))
      return res
        .status(400)
        .json({ error: 'Refunds not allowed for reassignment', code: 'REFUND_NOT_ALLOWED_FOR_REASSIGNMENT' });
    const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
    const walletBalance = wallet ? wallet.balance : 0;
    let walletForThis = isReassignment ? Math.min(walletBalance, category.price) : 0;
    let refundForThis =
      !isReassignment && useRefundOnly && expectedRefund > 0
        ? Math.min(
            expectedRefund,
            await Payment.getAllAvailableRefunds(userId),
            category.price
          )
        : 0;
    let remainingAmount = Math.max(0, category.price - walletForThis - refundForThis);
    const tx_ref = generateUniqueTransactionRef('flw', userId, adId + '_' + categoryId);
    if (remainingAmount <= 0.01) {
      const payment = new Payment({
        paymentId: tx_ref,
        tx_ref,
        adId,
        advertiserId: userId,
        webOwnerId: website.ownerId,
        websiteId,
        categoryId,
        amount: category.price,
        currency: 'RWF',
        status: 'successful',
        walletApplied: walletForThis,
        refundApplied: isReassignment ? 0 : refundForThis,
        amountPaid: 0,
        paymentMethod: walletForThis > 0 ? 'wallet_only' : 'refund_only',
        isReassignment,
        paidAt: new Date(),
      });
      await payment.save();
      return res.status(200).json({
        success: true,
        allPaid: true,
        paymentId: payment._id,
        tx_ref,
        walletApplied: walletForThis,
        refundApplied: isReassignment ? 0 : refundForThis,
        amountPaid: 0,
        totalCost: category.price,
      });
    }
    const paymentUrl = await exports.generateFlutterwavePaymentUrl({
      tx_ref,
      amount: remainingAmount,
      customer: { email: ad.adOwnerEmail, name: ad.businessName },
      customizations: {
        description: 'Ad space: ' + category.categoryName + ' on ' + website.websiteName,
      },
    });
    const payment = new Payment({
      paymentId: tx_ref,
      tx_ref,
      adId,
      advertiserId: userId,
      webOwnerId: website.ownerId,
      websiteId,
      categoryId,
      amount: category.price,
      currency: 'RWF',
      status: 'pending',
      flutterwaveData: { paymentUrl },
      walletApplied: walletForThis,
      refundApplied: isReassignment ? 0 : refundForThis,
      amountPaid: remainingAmount,
      paymentMethod:
        walletForThis > 0
          ? 'wallet_hybrid'
          : refundForThis > 0 && !isReassignment
          ? 'refund_hybrid'
          : 'flutterwave',
      isReassignment,
    });
    await payment.save();
    res.status(200).json({
      success: true,
      paymentUrl,
      paymentId: payment._id,
      tx_ref,
      walletApplied: walletForThis,
      refundApplied: isReassignment ? 0 : refundForThis,
      amountPaid: remainingAmount,
      totalCost: category.price,
      isReassignment,
    });
  } catch (error) {
    console.error('initiatePaymentWithRefund error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── handleWebhook ─────────────────────────────────────────────────────────
exports.handleWebhook = async (req, res) => {
  try {
    // Flutterwave signs webhooks with the FLW_SECRET_HASH header
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers['verif-hash'];

    console.log('[Webhook] verif-hash header:', signature ? signature.substring(0, 8) + '...' : 'MISSING');
    console.log('[Webhook] FLW_SECRET_HASH set:', !!secretHash);

    if (secretHash && (!signature || signature !== secretHash)) {
      console.log('[Webhook] Hash mismatch — rejecting');
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    const payload = req.body;
    // Flutterwave sandbox sometimes omits the top-level 'event' field;
    // fall back to 'event.type' which appears in card transaction payloads
    const event = payload.event || payload['event.type'];
    // data lives under payload.data for standard webhooks, or at the root for some sandbox payloads
    const data = payload.data || payload;

    console.log('[Webhook] event:', event, '| tx_ref:', data?.tx_ref || payload?.txRef);

    if (event === 'charge.completed' || event === 'CARD_TRANSACTION') {
      if (data?.status === 'successful') {
        const fakeReq = {
          body: { transaction_id: String(data.id), tx_ref: data.tx_ref },
        };
        const fakeRes = {
          status: (code) => ({
            json: (d) => console.log(`Webhook verify result ${code}:`, d),
          }),
        };
        await exports.verifyPayment(fakeReq, fakeRes);
      } else {
        // failed / cancelled charge
        const reference = data?.tx_ref;
        if (reference) {
          await Payment.findOneAndUpdate(
            { $or: [{ tx_ref: reference }, { baseReference: reference }] },
            { status: 'failed' }
          );
        }
      }
      return res.status(200).json({ status: 'success', event });
    }

    // All other events — acknowledge
    res.status(200).json({ status: 'acknowledged', event });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// ─── Misc endpoints ────────────────────────────────────────────────────────
exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const wallet = await Wallet.findOne({ ownerId: userId, ownerType: 'advertiser' });
    res.status(200).json({
      success: true,
      walletBalance: wallet ? wallet.balance : 0,
      hasWallet: !!wallet,
    });
  } catch (error) {
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
      refundCount: refundBreakdown.count,
    });
  } catch (error) {
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
      refundUsed: { $ne: true },
    })
      .populate('adId', 'businessName')
      .sort({ refundedAt: -1 });
    res.status(200).json({
      success: true,
      totalAvailableRefunds: availableRefunds,
      refundCount: refundDetails.length,
      refundDetails: refundDetails.map((p) => ({
        paymentId: p._id,
        amount: p.amount,
        refundedAt: p.refundedAt,
        refundReason: p.refundReason,
        businessName: p.adId?.businessName || 'Unknown Business',
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.validateCategoryData = async (req, res) => {
  try {
    const { categoryId, websiteId } = req.body;
    const [category, website] = await Promise.all([
      AdCategory.findById(categoryId),
      Website.findById(websiteId),
    ]);
    if (!category) return res.status(404).json({ error: 'Category not found', categoryId });
    if (!website) return res.status(404).json({ error: 'Website not found', websiteId });
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
        currentAds: category.selectedAds?.length || 0,
      },
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
    res.status(500).json({ error: 'Validation failed', message: error.message });
  }
};

exports.debugRoutes = (req, res) => {
  res.json({
    success: true,
    message: 'Payment routes are working (Flutterwave)',
    paymentGateway: 'Flutterwave',
    sandboxMode: FLW_TEST_MODE,
    supportedMethods: ['card', 'mobilemoney (MoMo)'],
    availableRoutes: [
      'POST /payment/initiate',
      'POST /payment/verify',
      'POST /payment/verify-non-transactional',
      'POST /payment/initiate-with-refund',
      'POST /payment/process-wallet',
      'POST /payment/calculate-breakdown',
      'POST /payment/validate-category',
      'POST /payment/webhook',
    ],
  });
};