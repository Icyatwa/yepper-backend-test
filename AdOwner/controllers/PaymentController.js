// PaymentController.js — Flutterwave integration (PostgreSQL)
const crypto = require('crypto');
const axios = require('axios');
const User = require('../../models/User');
const Payment = require('../models/PaymentModel');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/walletModel');
const { getClient } = require('../../config/db');

// ─── Flutterwave helpers ───────────────────────────────────────────────────
const FLW_TEST_MODE = process.env.FLUTTERWAVE_TEST_MODE !== 'false';
const FLW_TEST_SECRET_KEY = process.env.FLW_TEST_SECRET_KEY;
const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

const flwHeaders = () => ({
  Authorization: `Bearer ${FLW_TEST_SECRET_KEY}`,
  'Content-Type': 'application/json',
});

const createFlutterwaveLink = async ({
  tx_ref, amount, currency = 'RWF', customer, description, redirect_url,
  payment_options = 'card,mobilemoney',
}) => {
  if (!FLW_TEST_SECRET_KEY) throw new Error('Flutterwave secret key is not set.');
  console.log(`[Flutterwave] createLink — mode=${FLW_TEST_MODE ? 'SANDBOX' : 'LIVE'} amount=${amount} ${currency} ref=${tx_ref}`);
  let response;
  try {
    response = await axios.post(
      `${FLW_BASE_URL}/payments`,
      { tx_ref, amount, currency, redirect_url, payment_options,
        customer: { email: customer.email, name: customer.name },
        customizations: { title: 'Yepper Ads', description, logo: process.env.BRAND_LOGO_URL || '' },
        meta: { source: 'yepper', sandbox: FLW_TEST_MODE } },
      { headers: flwHeaders(), timeout: 30000 }
    );
  } catch (axiosErr) {
    console.error('[Flutterwave] API call failed:', { status: axiosErr.response?.status, data: axiosErr.response?.data });
    throw new Error(axiosErr.response?.data?.message || `Flutterwave API error: ${axiosErr.message}`);
  }
  if (response.data.status === 'success') {
    const url = response.data.data?.link;
    console.log('[Flutterwave] payment link created:', url);
    return url;
  }
  throw new Error(`Flutterwave link creation failed: ${response.data.message || 'Unknown error'}`);
};

const verifyFlutterwaveTransaction = async (identifier) => {
  const isNumericId = /^\d+$/.test(String(identifier));
  if (isNumericId) {
    const response = await axios.get(`${FLW_BASE_URL}/transactions/${identifier}/verify`, { headers: flwHeaders(), timeout: 30000 });
    return response.data;
  }
  const response = await axios.get(`${FLW_BASE_URL}/transactions`, { params: { tx_ref: identifier }, headers: flwHeaders(), timeout: 30000 });
  if (response.data.status === 'success' && Array.isArray(response.data.data) && response.data.data.length > 0) {
    return { status: 'success', data: response.data.data[0] };
  }
  return { status: 'error', data: null };
};

const generateUniqueTransactionRef = (prefix, userId, additionalData = '') => {
  const timestamp = Date.now();
  const nanoTime = process.hrtime.bigint().toString();
  const random = crypto.randomBytes(8).toString('hex');
  const counter = Math.floor(Math.random() * 9999);
  const hash = crypto.createHash('sha256')
    .update(`${userId}_${additionalData}_${timestamp}_${nanoTime}_${random}_${counter}`)
    .digest('hex').substring(0, 12);
  return `${prefix}_${userId}_${hash}_${timestamp}_${counter}`;
};

// Helper: get available refund total for a user
const getAllAvailableRefunds = async (userId) => {
  const refunds = await Payment.findAvailableRefunds(userId);
  return refunds.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
};

// Helper: upsert wallet balance
const upsertWallet = async (client, ownerId, ownerType, ownerEmail, incBalance, incEarned, incSpent) => {
  await client.query(
    `INSERT INTO wallets (owner_id, owner_type, owner_email, balance, total_earned, total_spent, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (owner_id, owner_type) DO UPDATE SET
       balance = wallets.balance + $4,
       total_earned = wallets.total_earned + $5,
       total_spent = wallets.total_spent + $6,
       last_updated = NOW()
     RETURNING *`,
    [ownerId, ownerType, ownerEmail || '', incBalance || 0, incEarned || 0, incSpent || 0]
  );
};

// Helper: parse website_selections from postgres row
const parseSelections = (ad) => {
  if (!ad) return [];
  const ws = ad.website_selections;
  if (!ws) return [];
  if (Array.isArray(ws)) return ws;
  try { return JSON.parse(ws); } catch { return []; }
};

// Helper: update website_selections on an ad row via client
const updateAdSelections = async (client, adId, websiteSelections) => {
  await client.query(
    `UPDATE import_ads SET website_selections = $1 WHERE id = $2`,
    [JSON.stringify(websiteSelections), adId]
  );
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
    if (ad.user_id.toString() !== userId.toString())
      return res.status(403).json({ error: 'Unauthorized access to ad' });

    const websiteSelections = parseSelections(ad);
    let totalAmount = 0;
    const validatedSelections = [];
    const categoryDetails = [];

    for (const selection of selections) {
      const { websiteId, categoryId } = selection;
      const existing = websiteSelections.find(
        (sel) => sel.websiteId === websiteId && Array.isArray(sel.categories) &&
          sel.categories.includes(categoryId) && sel.status === 'active'
      );
      if (existing) continue;

      const category = await AdCategory.findById(categoryId);
      const website = await Website.findById(websiteId);
      if (!category || !website) {
        return res.status(404).json({ error: `Category or website not found for: ${categoryId}` });
      }

      totalAmount += parseFloat(category.price);
      validatedSelections.push({
        websiteId,
        categoryId,
        webOwnerId: website.owner_id,
        price: parseFloat(category.price),
        categoryName: category.category_name,
        websiteName: website.website_name,
      });
      categoryDetails.push({
        categoryName: category.category_name,
        websiteName: website.website_name,
        price: parseFloat(category.price),
        webOwnerId: website.owner_id,
      });
    }

    if (validatedSelections.length === 0) {
      return res.status(400).json({ error: 'All selected placements are already paid for' });
    }

    const baseReference = `bulk_${adId}_${Date.now()}`;
    const tx_ref = `${baseReference}_flw`;

    const paymentUrl = await createFlutterwaveLink({
      tx_ref,
      amount: totalAmount,
      currency: 'RWF',
      redirect_url: `${process.env.FRONTEND_URL}/payment/callback`,
      customer: { email: ad.ad_owner_email, name: ad.business_name },
      description: `Payment for ${validatedSelections.length} ad placement(s)`,
    });

    for (let index = 0; index < validatedSelections.length; index++) {
      const selection = validatedSelections[index];
      await Payment.create({
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
    }

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
      let primaryPayment = await Payment.findByTxRef(flwData.tx_ref || identifier);
      if (!primaryPayment) primaryPayment = await Payment.findByPaymentId(String(flwData.id || identifier));
      if (!primaryPayment) return res.status(404).json({ error: 'Payment record not found' });
      if (primaryPayment.status === 'successful') {
        return res.status(200).json({ success: true, message: 'Payment already processed', payment: primaryPayment });
      }

      const allPayments = await Payment.findByBaseReference(primaryPayment.base_reference);
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const ad = await client.query(`SELECT * FROM import_ads WHERE id = $1`, [primaryPayment.ad_id]);
        if (!ad.rows[0]) throw new Error('Ad not found');
        const adRow = ad.rows[0];
        const websiteSelections = parseSelections(adRow);

        const advertiser = await User.findById(primaryPayment.advertiser_id);
        const totalAmount = allPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

        await upsertWallet(client, primaryPayment.advertiser_id, 'advertiser', advertiser?.email, 0, 0, totalAmount);

        const rejectionDeadline = new Date();
        rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

        for (const payment of allPayments) {
          await client.query(
            `UPDATE payments SET status = 'successful', paid_at = NOW(), payment_id = $1, flutterwave_data = $2 WHERE id = $3`,
            [`${flwData.id}_${payment.id}`, JSON.stringify(flwData), payment.id]
          );

          const category = await AdCategory.findById(payment.category_id);
          const website = await Website.findById(payment.website_id);
          if (!category || !website) continue;

          const selIdx = websiteSelections.findIndex(
            (sel) => sel.websiteId === payment.website_id &&
              Array.isArray(sel.categories) && sel.categories.includes(payment.category_id)
          );

          if (selIdx !== -1) {
            Object.assign(websiteSelections[selIdx], {
              status: 'active', approved: true, approvedAt: new Date().toISOString(),
              publishedAt: new Date().toISOString(), paymentId: payment.id,
              rejectionDeadline: rejectionDeadline.toISOString(),
            });
          } else {
            websiteSelections.push({
              websiteId: payment.website_id, categories: [payment.category_id],
              approved: true, approvedAt: new Date().toISOString(),
              publishedAt: new Date().toISOString(), paymentId: payment.id,
              status: 'active', rejectionDeadline: rejectionDeadline.toISOString(),
            });
          }

          await client.query(
            `UPDATE ad_categories SET selected_ads = array_append(COALESCE(selected_ads, ARRAY[]::text[]), $1)
             WHERE id = $2 AND NOT ($1 = ANY(COALESCE(selected_ads, ARRAY[]::text[])))`,
            [payment.ad_id, payment.category_id]
          );

          const webOwnerEmail = category.web_owner_email;
          const wallet = await client.query(
            `INSERT INTO wallets (owner_id, owner_type, owner_email, balance, total_earned, total_spent, last_updated)
             VALUES ($1, 'webOwner', $2, $3, $3, 0, NOW())
             ON CONFLICT (owner_id, owner_type) DO UPDATE SET
               balance = wallets.balance + $3, total_earned = wallets.total_earned + $3, last_updated = NOW()
             RETURNING *`,
            [website.owner_id, webOwnerEmail || '', parseFloat(payment.amount)]
          );

          await client.query(
            `INSERT INTO wallet_transactions (wallet_id, payment_id, ad_id, amount, type, description, status)
             VALUES ($1, $2, $3, $4, 'credit', $5, 'completed')`,
            [wallet.rows[0].id, payment.id, payment.ad_id, payment.amount,
             `Payment for ad: ${adRow.business_name} - ${category.category_name}`]
          );
        }

        await client.query(
          `UPDATE import_ads SET website_selections = $1, confirmed = true WHERE id = $2`,
          [JSON.stringify(websiteSelections), adRow.id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.status(200).json({
        success: true,
        message: `Payment verified and ${allPayments.length} ad placements published successfully`,
        paymentsProcessed: allPayments.length,
      });
    } else {
      const failedPayment = await Payment.findByTxRef(identifier);
      if (failedPayment?.base_reference) {
        const grouped = await Payment.findByBaseReference(failedPayment.base_reference);
        for (const p of grouped) {
          await Payment.update(p.id, { status: 'failed' });
        }
      }
      res.status(400).json({ success: false, message: 'Payment verification failed', details: flwData });
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
      let payment = await Payment.findByTxRef(flwData.tx_ref || identifier);
      if (!payment) payment = await Payment.findByPaymentId(String(flwData.id || identifier));
      if (!payment) return res.status(404).json({ error: 'Payment record not found' });
      if (payment.status === 'successful')
        return res.status(200).json({ success: true, message: 'Payment already processed', payment });

      const updated = await Payment.update(payment.id, {
        paymentId: String(flwData.id || identifier),
        status: 'successful',
        paidAt: new Date(),
        flutterwaveData: flwData,
      });

      if (!updated) return res.status(404).json({ error: 'Payment update failed' });

      try {
        const ad = await ImportAd.findById(payment.ad_id);
        if (ad) {
          const websiteSelections = parseSelections(ad);
          const selIdx = websiteSelections.findIndex(
            (sel) => sel.websiteId === payment.website_id &&
              Array.isArray(sel.categories) && sel.categories.includes(payment.category_id)
          );
          const rejectionDeadline = new Date();
          rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);
          if (selIdx !== -1) {
            Object.assign(websiteSelections[selIdx], {
              status: 'active', approved: true, approvedAt: new Date().toISOString(),
              publishedAt: new Date().toISOString(), paymentId: payment.id,
              rejectionDeadline: rejectionDeadline.toISOString(),
            });
          } else {
            websiteSelections.push({
              websiteId: payment.website_id, categories: [payment.category_id],
              approved: true, approvedAt: new Date().toISOString(),
              publishedAt: new Date().toISOString(), paymentId: payment.id,
              status: 'active', rejectionDeadline: rejectionDeadline.toISOString(),
            });
          }
          await ImportAd.update(ad.id, { websiteSelections, confirmed: true });
        }

        const advertiser = await User.findById(payment.advertiser_id);
        if (advertiser) {
          await Wallet.create({ ownerId: payment.advertiser_id, ownerEmail: advertiser.email, ownerType: 'advertiser' });
          const w = await Wallet.findByOwner(payment.advertiser_id, 'advertiser');
          if (w) await Wallet.update(w.id, { totalSpent: w.total_spent + parseFloat(payment.amount) });
        }

        const category = await AdCategory.findById(payment.category_id);
        const website = await Website.findById(payment.website_id);
        if (website) {
          const ownerEmail = category?.web_owner_email;
          const ww = await Wallet.create({ ownerId: website.owner_id, ownerEmail: ownerEmail || '', ownerType: 'webOwner' });
          const ownerWallet = await Wallet.findByOwner(website.owner_id, 'webOwner');
          if (ownerWallet) {
            await Wallet.update(ownerWallet.id, {
              balance: ownerWallet.balance + parseFloat(payment.amount),
              totalEarned: ownerWallet.total_earned + parseFloat(payment.amount),
            });
            await WalletTransaction.create({
              walletId: ownerWallet.id, paymentId: payment.id, adId: payment.ad_id,
              amount: payment.amount, type: 'credit',
              description: `Payment for ad: ${ad?.business_name || 'Unknown'} on category: ${category?.category_name || 'Unknown'}`,
            });
          }
        }
      } catch (updateError) {
        console.error('Post-payment update error:', updateError);
      }

      res.status(200).json({ success: true, message: 'Payment verified and ad published successfully', payment: updated });
    } else {
      const failed = await Payment.findByTxRef(identifier);
      if (failed) await Payment.update(failed.id, { status: 'failed' });
      res.status(400).json({ success: false, message: 'Payment verification failed', details: flwData });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── generateFlutterwavePaymentUrl ────────────────────────────────────────
exports.generateFlutterwavePaymentUrl = async (paymentData) => {
  try {
    if (!FLW_TEST_SECRET_KEY) throw new Error('Flutterwave API key not configured.');
    const frontendUrl = process.env.FRONTEND_URL || 'https://yepper.cc';
    return await createFlutterwaveLink({
      tx_ref: paymentData.tx_ref,
      amount: paymentData.amount,
      currency: 'RWF',
      redirect_url: `${frontendUrl}/payment-callback2`,
      customer: paymentData.customer,
      description: paymentData.customizations?.description || 'Ad payment',
    });
  } catch (error) {
    console.error('Flutterwave payment URL generation error:', error.response?.data || error.message);
    if (error.response?.status === 401) throw new Error('Flutterwave authentication failed.');
    if (error.response?.status === 400) throw new Error('Invalid payment data.');
    throw new Error('Payment URL generation failed. Please try again later.');
  }
};

exports.generateXentriPayPaymentUrl = exports.generateFlutterwavePaymentUrl;

// ─── handleProcessWallet ───────────────────────────────────────────────────
exports.handleProcessWallet = async (req, res) => {
  const client = await getClient();
  try {
    const { selections, isReassignment = false } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'No selections provided' });
    }

    const wallet = await Wallet.findByOwner(userId, 'advertiser');
    const walletBalance = wallet ? parseFloat(wallet.balance) : 0;

    let totalCost = 0;
    const processedSelections = [];

    for (const selection of selections) {
      const ad = await ImportAd.findById(selection.adId);
      const category = await AdCategory.findById(selection.categoryId);
      const website = await Website.findById(selection.websiteId);

      if (!ad) return res.status(404).json({ error: 'Ad not found', adId: selection.adId });
      if (!category) return res.status(404).json({ error: 'Category not found', categoryId: selection.categoryId });
      if (!website) return res.status(404).json({ error: 'Website not found', websiteId: selection.websiteId });
      if (ad.user_id !== userId) return res.status(403).json({ error: 'Unauthorized access to ad' });

      const price = parseFloat(category.price) || 0;
      totalCost += price;
      processedSelections.push({ ...selection, ad, category, website, price });
    }

    const buildPaymentUrl = async (amount, baseRef, customerEmail, customerName, desc) => {
      return await exports.generateFlutterwavePaymentUrl({
        tx_ref: baseRef, amount,
        customer: { email: customerEmail, name: customerName || 'User' },
        customizations: { description: desc },
      });
    };

    // Hybrid or wallet-only for reassignment
    if (isReassignment && walletBalance < totalCost) {
      const walletToUse = Math.min(walletBalance, totalCost);
      const remainingAmount = totalCost - walletToUse;
      const baseHybridRef = generateUniqueTransactionRef('hybrid_reassignment_base', userId, `${selections.length}_${totalCost}`);

      for (let i = 0; i < processedSelections.length; i++) {
        const sel = processedSelections[i];
        const individualTxRef = generateUniqueTransactionRef('hybrid_reassignment_item', userId, `${sel.adId}_${sel.categoryId}_${i}`);
        await Payment.create({
          advertiserId: userId, tx_ref: individualTxRef, baseReference: baseHybridRef,
          amount: sel.price, paymentType: 'hybrid_reassignment', status: 'pending',
          adId: sel.adId, websiteId: sel.websiteId, categoryId: sel.categoryId,
          webOwnerId: sel.category.owner_id, paymentId: `pending_${individualTxRef}`,
          isReassignment: true, walletApplied: walletToUse * (sel.price / totalCost),
          amountPaid: remainingAmount * (sel.price / totalCost),
          metadata: { selectionIndex: i, totalSelections: processedSelections.length, hybridPayment: true },
        });
      }

      const paymentUrl = await buildPaymentUrl(remainingAmount, baseHybridRef, req.user.email, req.user.name, `Reassignment for ${processedSelections.length} categories`);
      return res.status(200).json({
        success: true, allPaid: false,
        message: `${walletToUse.toFixed(2)} from wallet. Pay ${remainingAmount.toFixed(2)} via card/MoMo.`,
        summary: { totalCost, walletUsed: walletToUse, cardAmount: remainingAmount, refundUsed: 0, isReassignment: true },
        paymentUrl, tx_ref: baseHybridRef, paymentCount: processedSelections.length,
      });
    }

    if (!isReassignment && walletBalance < totalCost) {
      const availableRefunds = await getAllAvailableRefunds(userId);
      const walletToUse = Math.min(walletBalance, totalCost);
      const remainingAfterWallet = totalCost - walletToUse;
      const refundToUse = Math.min(availableRefunds, remainingAfterWallet);
      const remainingAmount = remainingAfterWallet - refundToUse;
      const baseHybridRef = generateUniqueTransactionRef('hybrid_base', userId, `${selections.length}_${totalCost}`);

      for (let i = 0; i < processedSelections.length; i++) {
        const sel = processedSelections[i];
        const individualTxRef = generateUniqueTransactionRef('hybrid_item', userId, `${sel.adId}_${sel.categoryId}_${i}`);
        await Payment.create({
          advertiserId: userId, tx_ref: individualTxRef, baseReference: baseHybridRef,
          amount: sel.price, paymentType: 'hybrid', status: 'pending',
          adId: sel.adId, websiteId: sel.websiteId, categoryId: sel.categoryId,
          webOwnerId: sel.category.owner_id, paymentId: `pending_${individualTxRef}`,
          isReassignment: false, walletApplied: walletToUse * (sel.price / totalCost),
          refundApplied: refundToUse * (sel.price / totalCost),
          amountPaid: remainingAmount * (sel.price / totalCost),
          metadata: { selectionIndex: i, totalSelections: processedSelections.length, hybridPayment: true },
        });
      }

      const paymentUrl = await buildPaymentUrl(remainingAmount, baseHybridRef, req.user.email, req.user.name, `Payment for ${processedSelections.length} categories`);
      return res.status(200).json({
        success: true, allPaid: false,
        message: `${(walletToUse + refundToUse).toFixed(2)} applied. Pay ${remainingAmount.toFixed(2)} via card/MoMo.`,
        summary: { totalCost, walletUsed: walletToUse, cardAmount: remainingAmount, refundUsed: refundToUse, isReassignment: false },
        paymentUrl, tx_ref: baseHybridRef, paymentCount: processedSelections.length,
      });
    }

    // Full wallet payment
    const baseWalletRef = generateUniqueTransactionRef(isReassignment ? 'wallet_reassignment_base' : 'wallet_base', userId, `${selections.length}_${totalCost}`);

    await client.query('BEGIN');
    try {
      if (wallet) {
        await client.query(
          `UPDATE wallets SET balance = balance - $1, total_spent = total_spent + $1, last_updated = NOW() WHERE id = $2`,
          [totalCost, wallet.id]
        );
      }

      for (let i = 0; i < processedSelections.length; i++) {
        const sel = processedSelections[i];
        const individualTxRef = generateUniqueTransactionRef(
          isReassignment ? 'wallet_reassignment_item' : 'wallet_item',
          userId, `${sel.adId}_${sel.categoryId}_${i}`
        );
        await Payment.create({
          advertiserId: userId, tx_ref: individualTxRef, baseReference: baseWalletRef,
          amount: sel.price, paymentType: isReassignment ? 'wallet_reassignment' : 'wallet',
          status: 'successful', adId: sel.adId, websiteId: sel.websiteId,
          categoryId: sel.categoryId, webOwnerId: sel.category.owner_id,
          paymentId: individualTxRef, isReassignment, walletApplied: sel.price,
          amountPaid: 0, paidAt: new Date(),
          metadata: { selectionIndex: i, totalSelections: processedSelections.length, fullWalletPayment: true },
        });

        const adRow = await ImportAd.findById(sel.adId);
        if (adRow) {
          const wsArr = parseSelections(adRow);
          const selIdx = wsArr.findIndex(s => s.websiteId === sel.websiteId && Array.isArray(s.categories) && s.categories.includes(sel.categoryId));
          if (selIdx !== -1) {
            wsArr[selIdx] = { ...wsArr[selIdx], approved: true, approvedAt: new Date().toISOString(), status: 'active', publishedAt: new Date().toISOString() };
          }
          await client.query(`UPDATE import_ads SET website_selections = $1 WHERE id = $2`, [JSON.stringify(wsArr), sel.adId]);
        }

        await client.query(
          `UPDATE ad_categories SET selected_ads = array_append(COALESCE(selected_ads, ARRAY[]::text[]), $1)
           WHERE id = $2 AND NOT ($1 = ANY(COALESCE(selected_ads, ARRAY[]::text[])))`,
          [sel.adId, sel.categoryId]
        );

        await client.query(
          `INSERT INTO wallets (owner_id, owner_type, owner_email, balance, total_earned, total_spent, last_updated)
           VALUES ($1, 'webOwner', $2, $3, $3, 0, NOW())
           ON CONFLICT (owner_id, owner_type) DO UPDATE SET balance = wallets.balance + $3, total_earned = wallets.total_earned + $3, last_updated = NOW()`,
          [sel.category.owner_id, sel.category.web_owner_email || '', sel.price]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const updatedWallet = await Wallet.findByOwner(userId, 'advertiser');
    res.status(200).json({
      success: true, allPaid: true,
      message: `All payments processed via wallet. Remaining: ${parseFloat(updatedWallet?.balance || 0).toFixed(2)}`,
      summary: { totalCost, walletUsed: totalCost, cardAmount: 0, refundUsed: 0, isReassignment, remainingBalance: updatedWallet?.balance || 0 },
      tx_ref: baseWalletRef, paymentCount: processedSelections.length,
    });
  } catch (error) {
    console.error('Handle process wallet error:', error);
    res.status(500).json({ error: 'Wallet payment failed', message: error.message });
  } finally {
    client.release();
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

    const wallet = await Wallet.findByOwner(userId, 'advertiser');
    const walletBalance = wallet ? parseFloat(wallet.balance) : 0;
    const availableRefunds = isReassignment ? 0 : await getAllAvailableRefunds(userId);

    let totalCost = 0;
    const categoryDetails = [];
    for (const selection of selections) {
      const category = await AdCategory.findById(selection.categoryId);
      const website = await Website.findById(selection.websiteId);
      if (category && website) {
        const price = parseFloat(category.price) || 0;
        totalCost += price;
        categoryDetails.push({ ...selection, price, categoryName: category.category_name, websiteName: website.website_name });
      }
    }

    let paidFromWallet = 0, paidFromRefunds = 0, needsExternalPayment = 0;
    if (isReassignment) {
      paidFromWallet = Math.min(walletBalance, totalCost);
      needsExternalPayment = Math.max(0, totalCost - walletBalance);
    } else {
      if (walletBalance >= totalCost) {
        paidFromWallet = totalCost;
      } else {
        paidFromWallet = walletBalance;
        const remaining = totalCost - walletBalance;
        paidFromRefunds = Math.min(availableRefunds, remaining);
        needsExternalPayment = remaining - paidFromRefunds;
      }
    }

    res.status(200).json({
      success: true,
      breakdown: categoryDetails,
      summary: {
        totalCost, walletBalance, availableRefunds: isReassignment ? 0 : availableRefunds,
        paidFromWallet, paidFromRefunds: isReassignment ? 0 : paidFromRefunds,
        needsExternalPayment, canAffordAll: needsExternalPayment === 0, isReassignment,
        paymentGateway: 'Flutterwave', sandboxMode: FLW_TEST_MODE,
      },
    });
  } catch (error) {
    console.error('Payment breakdown error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── initiatePaymentWithRefund ─────────────────────────────────────────────
exports.initiatePaymentWithRefund = async (req, res) => {
  try {
    const { adId, websiteId, categoryId, useRefundOnly = false, expectedRefund = 0, isReassignment = false } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    const ad = await ImportAd.findById(adId);
    const category = await AdCategory.findById(categoryId);
    const website = await Website.findById(websiteId);
    if (!ad || !category || !website)
      return res.status(404).json({ error: 'Ad, category, or website not found' });
    if (ad.user_id !== userId)
      return res.status(403).json({ error: 'Unauthorized access to ad' });
    if (isReassignment && (useRefundOnly || expectedRefund > 0))
      return res.status(400).json({ error: 'Refunds not allowed for reassignment', code: 'REFUND_NOT_ALLOWED_FOR_REASSIGNMENT' });

    const wallet = await Wallet.findByOwner(userId, 'advertiser');
    const walletBalance = wallet ? parseFloat(wallet.balance) : 0;
    const categoryPrice = parseFloat(category.price);
    let walletForThis = isReassignment ? Math.min(walletBalance, categoryPrice) : 0;
    let refundForThis = (!isReassignment && useRefundOnly && expectedRefund > 0)
      ? Math.min(expectedRefund, await getAllAvailableRefunds(userId), categoryPrice) : 0;
    let remainingAmount = Math.max(0, categoryPrice - walletForThis - refundForThis);
    const tx_ref = generateUniqueTransactionRef('flw', userId, adId + '_' + categoryId);

    if (remainingAmount <= 0.01) {
      const payment = await Payment.create({
        paymentId: tx_ref, tx_ref, adId, advertiserId: userId,
        webOwnerId: website.owner_id, websiteId, categoryId,
        amount: categoryPrice, currency: 'RWF', status: 'successful',
        walletApplied: walletForThis, refundApplied: isReassignment ? 0 : refundForThis,
        amountPaid: 0, paymentMethod: walletForThis > 0 ? 'wallet_only' : 'refund_only',
        isReassignment, paidAt: new Date(),
      });
      return res.status(200).json({ success: true, allPaid: true, paymentId: payment.id, tx_ref, walletApplied: walletForThis, refundApplied: isReassignment ? 0 : refundForThis, amountPaid: 0, totalCost: categoryPrice });
    }

    const paymentUrl = await exports.generateFlutterwavePaymentUrl({
      tx_ref, amount: remainingAmount,
      customer: { email: ad.ad_owner_email, name: ad.business_name },
      customizations: { description: `Ad space: ${category.category_name} on ${website.website_name}` },
    });

    const payment = await Payment.create({
      paymentId: tx_ref, tx_ref, adId, advertiserId: userId,
      webOwnerId: website.owner_id, websiteId, categoryId,
      amount: categoryPrice, currency: 'RWF', status: 'pending',
      flutterwaveData: { paymentUrl }, walletApplied: walletForThis,
      refundApplied: isReassignment ? 0 : refundForThis, amountPaid: remainingAmount,
      paymentMethod: walletForThis > 0 ? 'wallet_hybrid' : refundForThis > 0 ? 'refund_hybrid' : 'flutterwave',
      isReassignment,
    });

    res.status(200).json({ success: true, paymentUrl, paymentId: payment.id, tx_ref, walletApplied: walletForThis, refundApplied: isReassignment ? 0 : refundForThis, amountPaid: remainingAmount, totalCost: categoryPrice, isReassignment });
  } catch (error) {
    console.error('initiatePaymentWithRefund error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

// ─── handleWebhook ─────────────────────────────────────────────────────────
exports.handleWebhook = async (req, res) => {
  try {
    const secretHash = process.env.FLW_SECRET_HASH;
    const signature = req.headers['verif-hash'];
    if (secretHash && (!signature || signature !== secretHash)) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }
    const payload = req.body;
    const event = payload.event || payload['event.type'];
    const data = payload.data || payload;

    if (event === 'charge.completed' || event === 'CARD_TRANSACTION') {
      if (data?.status === 'successful') {
        const fakeReq = { body: { transaction_id: String(data.id), tx_ref: data.tx_ref } };
        const fakeRes = { status: (code) => ({ json: (d) => console.log(`Webhook verify result ${code}:`, d) }) };
        await exports.verifyPayment(fakeReq, fakeRes);
      } else {
        const reference = data?.tx_ref;
        if (reference) {
          const p = await Payment.findByTxRef(reference);
          if (p) await Payment.update(p.id, { status: 'failed' });
        }
      }
      return res.status(200).json({ status: 'success', event });
    }
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
    const wallet = await Wallet.findByOwner(userId, 'advertiser');
    res.status(200).json({ success: true, walletBalance: wallet ? parseFloat(wallet.balance) : 0, hasWallet: !!wallet });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.getRefundCredits = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const refunds = await Payment.findAvailableRefunds(userId);
    const total = refunds.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    res.status(200).json({ success: true, totalAvailableRefunds: total, refundDetails: refunds, refundCount: refunds.length });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.getAdvertiserRefundBalance = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const refundDetails = await Payment.findRefundsByAdvertiser(userId);
    const total = refundDetails.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    res.status(200).json({
      success: true, totalAvailableRefunds: total, refundCount: refundDetails.length,
      refundDetails: refundDetails.map(p => ({
        paymentId: p.id, amount: p.amount, refundedAt: p.refunded_at,
        refundReason: p.refund_reason, businessName: p.ad_business_name || 'Unknown Business',
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.validateCategoryData = async (req, res) => {
  try {
    const { categoryId, websiteId } = req.body;
    const [category, website] = await Promise.all([AdCategory.findById(categoryId), Website.findById(websiteId)]);
    if (!category) return res.status(404).json({ error: 'Category not found', categoryId });
    if (!website) return res.status(404).json({ error: 'Website not found', websiteId });
    const validation = {
      isValid: true, errors: [],
      data: { categoryId: category.id, categoryName: category.category_name, price: category.price, websiteId: website.id, websiteName: website.website_name },
    };
    if (!category.category_name) { validation.isValid = false; validation.errors.push('Category name missing'); }
    if (!category.price || category.price <= 0) { validation.isValid = false; validation.errors.push(`Invalid price: ${category.price}`); }
    if (!website.website_name) { validation.isValid = false; validation.errors.push('Website name missing'); }
    res.status(200).json(validation);
  } catch (error) {
    res.status(500).json({ error: 'Validation failed', message: error.message });
  }
};

exports.completeAdPlacement = async (adId, websiteId, categoryId, paymentId, client) => {
  const ad = await ImportAd.findById(adId);
  const category = await AdCategory.findById(categoryId);
  const website = await Website.findById(websiteId);
  const websiteSelections = parseSelections(ad);
  const selIdx = websiteSelections.findIndex(sel => sel.websiteId === websiteId && Array.isArray(sel.categories) && sel.categories.includes(categoryId));
  const rejectionDeadline = new Date();
  rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

  if (selIdx !== -1) {
    Object.assign(websiteSelections[selIdx], { status: 'active', approved: true, approvedAt: new Date().toISOString(), publishedAt: new Date().toISOString(), paymentId, rejectionDeadline: rejectionDeadline.toISOString(), isRejected: false });
  } else {
    websiteSelections.push({ websiteId, categories: [categoryId], approved: true, approvedAt: new Date().toISOString(), publishedAt: new Date().toISOString(), paymentId, status: 'active', rejectionDeadline: rejectionDeadline.toISOString(), isRejected: false });
  }

  await client.query(`UPDATE import_ads SET website_selections = $1, available_for_reassignment = false WHERE id = $2`, [JSON.stringify(websiteSelections), adId]);
  await client.query(`UPDATE ad_categories SET selected_ads = array_append(COALESCE(selected_ads, ARRAY[]::text[]), $1) WHERE id = $2 AND NOT ($1 = ANY(COALESCE(selected_ads, ARRAY[]::text[])))`, [adId, categoryId]);

  await client.query(
    `INSERT INTO wallets (owner_id, owner_type, owner_email, balance, total_earned, total_spent, last_updated)
     VALUES ($1, 'webOwner', $2, $3, $3, 0, NOW())
     ON CONFLICT (owner_id, owner_type) DO UPDATE SET balance = wallets.balance + $3, total_earned = wallets.total_earned + $3, last_updated = NOW()`,
    [website.owner_id, category.web_owner_email || '', parseFloat(category.price)]
  );
};

exports.debugRoutes = (req, res) => {
  res.json({ success: true, message: 'Payment routes are working (Flutterwave)', paymentGateway: 'Flutterwave', sandboxMode: FLW_TEST_MODE });
};
