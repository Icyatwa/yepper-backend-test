// createCategoryController.js  — PostgreSQL version (no Mongoose)
const { query, getClient } = require('../../config/db');
const AdCategory          = require('../models/CreateCategoryModel');
const { generateSiteScript } = require('./SiteScriptController');
const { Wallet, WalletTransaction } = require('../models/walletModel');
const User    = require('../../models/User');
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const Website = require('../models/CreateWebsiteModel');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel');
const Payment = require('../../AdOwner/models/PaymentModel');

const generateScriptTag = (categoryId) => {
  const BACKEND = process.env.BACKEND_URL || 'https://yepper-backend.onrender.com';
  const src = `${BACKEND}/api/ads/script/${categoryId}`;
  return { script: `<script src="${src}" async></script>` };
};

// ── Internal refund helper (PG transactions via pg client) ────────────────────
async function processInternalRefund({ client, payment, webOwnerId, advertiserId, amount, adId, categoryId, rejectionReason }) {
  const isSelfRejection = webOwnerId === advertiserId;

  if (isSelfRejection) {
    await client.query(
      `UPDATE payments SET internal_refund_processed=true, refunded_at=NOW(), refund_reason=$1, status='internally_refunded' WHERE id=$2`,
      [`Self-rejection: ${rejectionReason}`, payment.id]
    );
    return { success: true, selfRejection: true, refundAmount: amount };
  }

  // Get web owner wallet
  const { rows: [webOwnerWallet] } = await client.query(
    `SELECT * FROM wallets WHERE owner_id=$1 AND owner_type='webOwner' FOR UPDATE`, [webOwnerId]
  );
  if (!webOwnerWallet) throw new Error('Web owner wallet not found');
  if (webOwnerWallet.balance < amount) throw new Error(`Insufficient balance. Required: $${amount}, Available: $${webOwnerWallet.balance}`);

  // Get or create advertiser wallet
  let { rows: [advertiserWallet] } = await client.query(
    `SELECT * FROM wallets WHERE owner_id=$1 AND owner_type='advertiser' FOR UPDATE`, [advertiserId]
  );
  if (!advertiserWallet) {
    const ad = await ImportAd.findById(adId);
    const { rows: [newWallet] } = await client.query(
      `INSERT INTO wallets (owner_id, owner_email, owner_type, balance, total_earned) VALUES ($1,$2,'advertiser',0,0) RETURNING *`,
      [advertiserId, ad.ad_owner_email]
    );
    advertiserWallet = newWallet;
  }

  // Transfer funds
  const { rows: [updatedWebOwner] } = await client.query(
    `UPDATE wallets SET balance=balance-$1, last_updated=NOW() WHERE id=$2 RETURNING *`,
    [amount, webOwnerWallet.id]
  );
  const { rows: [updatedAdvertiser] } = await client.query(
    `UPDATE wallets SET balance=balance+$1, total_refunded=COALESCE(total_refunded,0)+$1, last_updated=NOW() WHERE id=$2 RETURNING *`,
    [amount, advertiserWallet.id]
  );

  // Create transaction records
  const { rows: [woTx] } = await client.query(
    `INSERT INTO wallet_transactions (wallet_id, payment_id, ad_id, amount, type, description, status) VALUES ($1,$2,$3,$4,'refund_debit',$5,'completed') RETURNING *`,
    [webOwnerWallet.id, payment.id, adId, -amount, `Refund processed - Ad rejected: ${rejectionReason}`]
  );
  await client.query(
    `INSERT INTO wallet_transactions (wallet_id, payment_id, ad_id, related_transaction_id, amount, type, description, status) VALUES ($1,$2,$3,$4,$5,'refund_credit',$6,'completed')`,
    [advertiserWallet.id, payment.id, adId, woTx.id, amount, `Refund received - Ad rejected by web owner: ${rejectionReason}`]
  );

  // Update payment
  await client.query(
    `UPDATE payments SET internal_refund_processed=true, refunded_at=NOW(), refund_reason=$1, status='refunded' WHERE id=$2`,
    [rejectionReason, payment.id]
  );

  return {
    success: true,
    selfRejection: false,
    refundAmount: amount,
    webOwnerNewBalance: updatedWebOwner.balance,
    advertiserNewBalance: updatedAdvertiser.balance
  };
}

// ── createCategory ────────────────────────────────────────────────────────────
exports.createCategory = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });

    const {
      websiteId, categoryName, description, price, customAttributes,
      spaceType, placementMode, userCount, instructions, visitorRange, tier
    } = req.body;

    const userId = req.user.userId || req.user.id || req.user._id;
    if (!userId) return res.status(401).json({ message: 'User ID not found in auth data' });

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'User not found' });

    if (!websiteId || !categoryName || !price || !spaceType || !visitorRange || !tier) {
      return res.status(400).json({
        message: 'Missing required fields',
        required: ['websiteId', 'categoryName', 'price', 'spaceType', 'visitorRange', 'tier'],
        received: { websiteId, categoryName, price, spaceType, visitorRange, tier }
      });
    }

    const savedCategory = await AdCategory.create({
      ownerId: user.id.toString(),
      websiteId,
      categoryName,
      description,
      price,
      spaceType,
      placementMode: placementMode || 'auto',
      instructions,
      customAttributes: customAttributes || {},
      webOwnerEmail: user.email,
      visitorRange,
      tier,
    });

    const backendUrl = process.env.BACKEND_URL || 'https://yepper-backend.onrender.com';
    const adSrc = `${backendUrl}/api/ads/script/${savedCategory.id}`;

    const apiCodes = {
      HTML: [
        `<!-- Yepper Ad: ${savedCategory.category_name} — Auto-Placement -->`,
        `<script src="${adSrc}" async></script>`,
      ].join('\n'),
      JavaScript: [
        `useEffect(() => {`,
        `  const s = document.createElement('script');`,
        `  s.src = '${adSrc}'; s.async = true;`,
        `  document.body.appendChild(s);`,
        `  return () => { try { document.body.removeChild(s); } catch(e){} };`,
        `}, []);`,
      ].join('\n'),
      PHP: [`<script src="${adSrc}" async></script>`].join('\n'),
      Python: [`ad_tag = '<script src="${adSrc}" async></script>'`].join('\n'),
      HTML_manual: [
        `<div data-yepper-space="${savedCategory.id}"></div>`,
        `<script src="${adSrc}" async></script>`,
      ].join('\n'),
      JavaScript_manual: [
        `// <div data-yepper-space="${savedCategory.id}"></div>`,
        `useEffect(() => {`,
        `  const s = document.createElement('script');`,
        `  s.src = '${adSrc}'; s.async = true;`,
        `  document.body.appendChild(s);`,
        `  return () => { try { document.body.removeChild(s); } catch(e){} };`,
        `}, []);`,
      ].join('\n'),
      PHP_manual: [
        `<div data-yepper-space="${savedCategory.id}"></div>`,
        `<script src="${adSrc}" async></script>`,
      ].join('\n'),
      Python_manual: [
        `placement_div = '<div data-yepper-space="${savedCategory.id}"></div>'`,
        `ad_script = '<script src="${adSrc}" async></script>'`,
      ].join('\n'),
    };

    const finalCategory = await AdCategory.update(savedCategory.id, { apiCodes });

    try { await generateSiteScript(websiteId); } catch(e) { console.error('Site script regen:', e.message); }

    res.status(201).json({ success: true, message: 'Category created successfully', category: finalCategory });

  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      message: 'Failed to create category',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// ── getActiveAds ──────────────────────────────────────────────────────────────
exports.getActiveAds = async (req, res) => {
  try {
    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const categories = await AdCategory.findByOwner(webOwnerId);
    const categoryIds = categories.map(c => c.id);
    const activeAds = await ImportAd.findActiveByCategories(categoryIds);
    res.status(200).json({ success: true, activeAds });
  } catch (error) {
    console.error('Error fetching active ads:', error);
    res.status(500).json({ error: 'Failed to fetch active ads' });
  }
};

// ── getPendingRejections ──────────────────────────────────────────────────────
exports.getPendingRejections = async (req, res) => {
  try {
    const webOwnerId = req.user.userId || req.user.id || req.user._id;
    const categories = await AdCategory.findByOwner(webOwnerId);
    const categoryIds = categories.map(c => c.id);
    const pendingAds = await ImportAd.findPendingByCategories(categoryIds, new Date());
    res.status(200).json({ success: true, pendingAds });
  } catch (error) {
    console.error('Error fetching pending rejections:', error);
    res.status(500).json({ error: 'Failed to fetch pending rejections' });
  }
};

// ── rejectAd ──────────────────────────────────────────────────────────────────
exports.rejectAd = async (req, res) => {
  const client = await getClient();
  try {
    const { adId, websiteId, categoryId } = req.params;
    const { rejectionReason } = req.body;
    const webOwnerId = req.user.userId || req.user.id || req.user._id;

    if (!rejectionReason || rejectionReason.trim().length < 10) {
      return res.status(400).json({ error: 'Rejection reason must be at least 10 characters' });
    }

    await client.query('BEGIN');

    const ad = await ImportAd.findById(adId);
    const category = await AdCategory.findById(categoryId);

    const { rows: [payment] } = await client.query(
      `SELECT * FROM payments WHERE ad_id=$1 AND website_id=$2 AND category_id=$3 AND status='successful'`,
      [adId, websiteId, categoryId]
    );

    if (!ad || !category || !payment) throw new Error('Required records not found');
    if (category.owner_id !== webOwnerId.toString()) throw new Error('Unauthorized: not your category');

    // Parse websiteSelections from JSONB
    const selections = Array.isArray(ad.website_selections)
      ? ad.website_selections
      : JSON.parse(ad.website_selections || '[]');

    const selectionIndex = selections.findIndex(sel =>
      sel.websiteId === websiteId &&
      Array.isArray(sel.categories) && sel.categories.includes(categoryId) &&
      sel.approved === true && !sel.isRejected
    );
    if (selectionIndex === -1) throw new Error('Ad selection not found or already processed');

    const sel = selections[selectionIndex];
    const now = new Date();
    if (sel.rejectionDeadline) {
      const deadline = new Date(sel.rejectionDeadline);
      if (now > new Date(deadline.getTime() + 5 * 60 * 1000)) {
        throw new Error('Rejection window has expired.');
      }
    }
    if (payment.internal_refund_processed) throw new Error('Refund already processed');

    // Update selection
    selections[selectionIndex] = {
      ...sel,
      isRejected: true, rejectedAt: now, rejectedBy: webOwnerId,
      rejectionReason: rejectionReason.trim(), approved: false, status: 'rejected'
    };
    const hasActive = selections.some(s => s.status === 'active' && !s.isRejected);

    await client.query(
      `UPDATE import_ads SET website_selections=$1, available_for_reassignment=$2 WHERE id=$3`,
      [JSON.stringify(selections), !hasActive, adId]
    );

    // Remove ad from category's selected_ads and decrement user_count
    await client.query(
      `UPDATE ad_categories
       SET selected_ads = (
         SELECT COALESCE(jsonb_agg(el), '[]'::jsonb)
         FROM jsonb_array_elements(COALESCE(selected_ads,'[]'::jsonb)) el
         WHERE el::text != $1::text
       ),
       user_count = GREATEST(0, COALESCE(user_count,0) - 1)
       WHERE id=$2`,
      [JSON.stringify(adId), categoryId]
    );

    await processInternalRefund({
      client, payment, webOwnerId,
      advertiserId: payment.advertiser_id,
      amount: payment.amount,
      adId, categoryId,
      rejectionReason: rejectionReason.trim()
    });

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Ad rejected and refund processed',
      rejectionReason: rejectionReason.trim(),
      timestamp: now.toISOString()
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reject ad error:', error);
    res.status(400).json({ error: error.message || 'Failed to reject ad' });
  } finally {
    client.release();
  }
};

// ── getCategoryBookingStatus ──────────────────────────────────────────────────
exports.getCategoryBookingStatus = async (req, res) => {
  try {
    const category = await AdCategory.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const selectedAds = Array.isArray(category.selected_ads)
      ? category.selected_ads
      : JSON.parse(category.selected_ads || '[]');

    const maxSlots = category.user_count || 10;
    const currentSlots = selectedAds.length;
    const availableSlots = Math.max(0, maxSlots - currentSlots);

    // Get website name
    const website = await Website.findById(category.website_id);

    res.status(200).json({
      success: true,
      category: {
        id: category.id,
        name: category.category_name,
        price: category.price,
        websiteName: website?.website_name,
        maxSlots,
        currentSlots,
        availableSlots,
        isFullyBooked: currentSlots >= maxSlots,
        occupancyRate: maxSlots > 0 ? ((currentSlots / maxSlots) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Error getting booking status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ── resetUserCount ────────────────────────────────────────────────────────────
exports.resetUserCount = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { newUserCount } = req.body;

    if (!newUserCount || newUserCount < 0) {
      return res.status(400).json({ error: 'Invalid Input', message: 'User count must be non-negative' });
    }

    const category = await AdCategory.findById(categoryId);
    if (!category) return res.status(404).json({ error: 'Not Found', message: 'Category not found' });

    // Count currently approved ads for this category via JSONB
    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM import_ads
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(website_selections) AS sel
         WHERE (sel->>'approved')::boolean = true
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(sel->'categories') cat_id
             WHERE cat_id = $1
           )
       )`,
      [categoryId]
    );
    const currentUserCount = parseInt(count, 10);

    if (newUserCount < currentUserCount) {
      return res.status(400).json({
        error: 'Invalid Reset',
        message: 'New user count cannot be less than current approved users'
      });
    }

    const updated = await AdCategory.update(categoryId, { userCount: newUserCount });
    res.status(200).json({ message: 'User count reset successfully', category: updated });

  } catch (error) {
    console.error('Error resetting user count:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};

// ── deleteCategory ────────────────────────────────────────────────────────────
exports.deleteCategory = async (req, res) => {
  const client = await getClient();
  try {
    const { categoryId } = req.params;
    const { ownerId } = req.body;

    const category = await AdCategory.findById(categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    if (category.owner_id.toString() !== ownerId) return res.status(403).json({ message: 'Unauthorized' });

    // Check for active/confirmed ads via JSONB
    const { rows: existingAds } = await query(
      `SELECT id FROM import_ads
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(website_selections) AS sel
         WHERE (sel->>'approved')::boolean = true OR (sel->>'confirmed')::boolean = true
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(sel->'categories') cat_id
             WHERE cat_id = $1
           )
       )`,
      [categoryId]
    );

    if (existingAds.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete category with active or confirmed ads',
        affectedAds: existingAds.map(a => a.id)
      });
    }

    await client.query('BEGIN');

    // Delete category
    await client.query(`DELETE FROM ad_categories WHERE id=$1`, [categoryId]);

    // Remove category reference from all import_ads website_selections
    await client.query(
      `UPDATE import_ads
       SET website_selections = (
         SELECT COALESCE(jsonb_agg(
           jsonb_set(sel, '{categories}', (
             SELECT COALESCE(jsonb_agg(cat), '[]'::jsonb)
             FROM jsonb_array_elements_text(sel->'categories') cat
             WHERE cat != $1
           ))
         ), '[]'::jsonb)
         FROM jsonb_array_elements(website_selections) AS sel
       )
       WHERE website_selections::text LIKE $2`,
      [categoryId, `%${categoryId}%`]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: 'Category deleted successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Failed to delete category', error: error.message });
  } finally {
    client.release();
  }
};

// ── getCategories (by ownerId param) ─────────────────────────────────────────
exports.getCategories = async (req, res) => {
  const { ownerId } = req.params;
  const page  = parseInt(req.query.page  || '1',  10);
  const limit = parseInt(req.query.limit || '10', 10);
  try {
    const all = await AdCategory.findByOwner(ownerId);
    const total = all.length;
    const categories = all.slice((page - 1) * limit, page * limit);
    res.status(200).json({ categories, totalPages: Math.ceil(total / limit), currentPage: page });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
  }
};

// ── getCategoriesByWebsiteForAdvertisers ──────────────────────────────────────
exports.getCategoriesByWebsiteForAdvertisers = async (req, res) => {
  const { websiteId } = req.params;
  const page  = parseInt(req.query.page  || '1',  10);
  const limit = parseInt(req.query.limit || '10', 10);

  try {
    // Validate it's a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(websiteId)) {
      return res.status(400).json({ message: 'Invalid website ID' });
    }

    const { rows: categories } = await query(
      `SELECT ac.*,
         COALESCE((
           SELECT COUNT(*)::int
           FROM import_ads ia
           WHERE EXISTS (
             SELECT 1 FROM jsonb_array_elements(ia.website_selections) sel
             WHERE sel->>'websiteId' = $1
               AND EXISTS (
                 SELECT 1 FROM jsonb_array_elements_text(sel->'categories') cat_id
                 WHERE cat_id = ac.id::text
               )
           )
         ), 0) AS current_user_count
       FROM ad_categories ac
       WHERE ac.website_id = $1
       ORDER BY ac.created_at DESC
       LIMIT $2 OFFSET $3`,
      [websiteId, limit, (page - 1) * limit]
    );

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM ad_categories WHERE website_id=$1`, [websiteId]
    );

    // Add isFullyBooked flag
    const enriched = categories.map(c => ({
      ...c,
      isFullyBooked: c.current_user_count >= (c.user_count || 0)
    }));

    res.status(200).json({ categories: enriched, totalPages: Math.ceil(parseInt(count) / limit), currentPage: page });

  } catch (error) {
    console.error('Error in getCategoriesByWebsiteForAdvertisers:', error);
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
  }
};

// ── getCategoriesByWebsite ────────────────────────────────────────────────────
exports.getCategoriesByWebsite = async (req, res) => {
  const { websiteId } = req.params;
  const page  = parseInt(req.query.page  || '1',  10);
  const limit = parseInt(req.query.limit || '10', 10);
  try {
    const all = await AdCategory.findByWebsite(websiteId);
    const total = all.length;
    const categories = all.slice((page - 1) * limit, page * limit);
    res.status(200).json({ categories, totalPages: Math.ceil(total / limit), currentPage: page });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
  }
};

// ── getCategoryById ───────────────────────────────────────────────────────────
exports.getCategoryById = async (req, res) => {
  try {
    const category = await AdCategory.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch category', error: error.message });
  }
};

// ── updateCategoryLanguage ────────────────────────────────────────────────────
exports.updateCategoryLanguage = async (req, res) => {
  try {
    const updated = await AdCategory.update(req.params.categoryId, { defaultLanguage: req.body.defaultLanguage });
    if (!updated) return res.status(404).json({ message: 'Category not found' });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating category language:', error);
    res.status(500).json({ message: 'Error updating category language', error: error.message });
  }
};

// ── getPendingAds ─────────────────────────────────────────────────────────────
exports.getPendingAds = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const websites = await Website.findByOwner(ownerId);
    if (!websites.length) return res.status(403).json({ message: 'No websites found for this owner' });

    const websiteIds = websites.map(w => w.id.toString());

    const { rows: pendingAds } = await query(
      `SELECT * FROM import_ads
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(website_selections) AS sel
         WHERE (sel->>'approved')::boolean = false
           AND sel->>'websiteId' = ANY($1::text[])
       )`,
      [websiteIds]
    );

    const transformedAds = pendingAds.map(ad => {
      const selections = Array.isArray(ad.website_selections)
        ? ad.website_selections
        : JSON.parse(ad.website_selections || '[]');

      const validSelections = selections.filter(sel =>
        websiteIds.includes(sel.websiteId) && sel.approved === false
      );
      if (!validSelections.length) return null;

      const website = websites.find(w => w.id.toString() === validSelections[0]?.websiteId);
      return {
        _id: ad.id,
        businessName: ad.business_name,
        businessLink: ad.business_link,
        businessLocation: ad.business_location,
        adDescription: ad.ad_description,
        imageUrl: ad.image_url,
        videoUrl: ad.video_url,
        pdfUrl: ad.pdf_url,
        websiteDetails: validSelections.map(sel => ({
          website: website || { id: sel.websiteId },
          categories: sel.categories,
          approved: sel.approved
        }))
      };
    }).filter(Boolean);

    res.status(200).json(transformedAds);
  } catch (error) {
    console.error('Server error in getPendingAds:', error);
    res.status(500).json({ message: 'Error fetching pending ads', error: error.message });
  }
};

// ── approveAdForWebsite ───────────────────────────────────────────────────────
exports.approveAdForWebsite = async (req, res) => {
  try {
    const { adId, websiteId } = req.params;

    const ad = await ImportAd.findById(adId);
    const website = await Website.findById(websiteId);

    if (!ad || !website) return res.status(404).json({ message: `${!ad ? 'Ad' : 'Website'} not found` });

    const selections = Array.isArray(ad.website_selections)
      ? ad.website_selections
      : JSON.parse(ad.website_selections || '[]');

    const idx = selections.findIndex(sel => sel.websiteId === websiteId || sel.websiteId === websiteId.toString());
    if (idx === -1) return res.status(404).json({ message: 'Ad not associated with this website' });

    selections[idx] = { ...selections[idx], approved: true, approvedAt: new Date() };
    const allApproved = selections.every(sel => sel.approved);

    const updated = await ImportAd.update(adId, {
      websiteSelections: selections,
      ...(allApproved ? { confirmed: true } : {})
    });

    res.status(200).json({ message: 'Ad approved successfully', ad: updated, allApproved });

  } catch (error) {
    console.error('Ad approval error:', error);
    res.status(500).json({ message: 'Error processing approval', error: error.message });
  }
};

// ── getWebOwnerBalance ────────────────────────────────────────────────────────
exports.getWebOwnerBalance = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const balance = await WebOwnerBalance.findOne({ userId });
    if (!balance) return res.status(404).json({ message: 'No balance found for this user' });

    res.status(200).json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ message: 'Error fetching balance', error: error.message });
  }
};

// ── getDetailedEarnings ───────────────────────────────────────────────────────
exports.getDetailedEarnings = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const { rows: payments } = await query(
      `SELECT p.id, p.amount, p.currency, p.created_at AS payment_date,
              ia.business_name, ia.business_location, ia.business_link, ia.ad_owner_email AS advertiser_email,
              p.tx_ref AS payment_reference
       FROM payments p
       JOIN import_ads ia ON ia.id = p.ad_id
       WHERE p.web_owner_id=$1 AND p.status='successful' AND p.withdrawn=false
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const balanceRecord = await WebOwnerBalance.findOne({ userId });

    const groupedPayments = payments.reduce((acc, payment) => {
      const monthYear = new Date(payment.payment_date).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (!acc[monthYear]) acc[monthYear] = { totalAmount: 0, payments: [] };
      acc[monthYear].payments.push(payment);
      acc[monthYear].totalAmount += parseFloat(payment.amount);
      return acc;
    }, {});

    res.status(200).json({
      totalBalance: {
        totalEarnings: balanceRecord?.total_earnings || 0,
        availableBalance: balanceRecord?.available_balance || 0
      },
      monthlyEarnings: Object.entries(groupedPayments).map(([month, data]) => ({
        month, totalAmount: data.totalAmount, payments: data.payments
      }))
    });
  } catch (error) {
    console.error('Error fetching detailed earnings:', error);
    res.status(500).json({ message: 'Error fetching detailed earnings', error: error.message });
  }
};
