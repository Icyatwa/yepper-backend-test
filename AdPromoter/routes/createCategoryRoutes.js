// AdCategoryRoutes.js — PostgreSQL version
const express  = require('express');
const router   = express.Router();
const AdCategory  = require('../models/CreateCategoryModel');
const categoryController   = require('../controllers/createCategoryController');
const WalletController     = require('../controllers/WalletController');
const WithdrawalController = require('../controllers/WithdrawalController');
const adRejectionController = require('../controllers/AdRejectionController');
const authMiddleware  = require('../../middleware/authmiddleware');
const earningsController = require('../controllers/earningsController');

// ── PUBLIC ───────────────────────────────────────────────────────────────────

router.get('/space/:categoryId', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    const category = await AdCategory.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Space not found' });
    // Return only public fields
    res.json({
      id: category.id,
      categoryName: category.category_name,
      spaceType: category.space_type,
      price: category.price,
      defaultLanguage: category.default_language,
      placementMode: category.placement_mode,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch space' });
  }
});

router.get('/ads/customization/:categoryId', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.header('Expires', '0');
    const category = await AdCategory.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ customization: category.customization || {}, timestamp: Date.now() });
  } catch (error) {
    console.error('Error fetching customization:', error);
    res.status(500).json({ error: 'Failed to fetch customization' });
  }
});

router.get('/category/:categoryId', categoryController.getCategoryById);

// ── AUTHENTICATED ────────────────────────────────────────────────────────────

router.use(authMiddleware);

router.post('/', categoryController.createCategory);
router.get('/', categoryController.getCategories);

router.get('/earnings/:categoryId', earningsController.getCategoryEarnings);
router.get('/pending-rejections', adRejectionController.getPendingRejections);
router.get('/active-ads', categoryController.getActiveAds);

router.get('/wallet', WalletController.getWallet);
router.get('/wallet/transactions', WalletController.getWalletTransactions);
router.post('/wallet/:ownerType/withdrawal-request', WithdrawalController.createWithdrawalRequest);
router.get('/wallet/:ownerType/withdrawal-requests', WithdrawalController.getUserWithdrawalRequests);
router.get('/wallet/:ownerType/balance', WalletController.getWalletBalance);
router.get('/wallet/:ownerType/transactions', WalletController.getTransactionHistory);
router.patch('/wallet/withdrawal-request/:requestId/cancel', WithdrawalController.cancelWithdrawalRequest);

router.get('/admin/withdrawal-requests', WithdrawalController.getAllWithdrawalRequests);
router.patch('/admin/withdrawal-request/:requestId/process', WithdrawalController.processWithdrawalRequest);

// Direct category lookup (duplicate route kept for compatibility)
router.get('/categoriees/:categoryId', async (req, res) => {
  try {
    const category = await AdCategory.findById(req.params.categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching category' });
  }
});

// Customization save
router.put('/categoriees/:categoryId/customization', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', 'https://www.yepper.cc');
    res.header('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    res.header('Access-Control-Allow-Credentials', 'true');

    const { categoryId } = req.params;
    const { customization } = req.body;
    const category = await AdCategory.findById(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const ownerId = category.owner_id?.toString();
    const userId  = (req.user.id || req.user._id || req.user.userId)?.toString();
    if (ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

    const merged = { ...(category.customization || {}), ...customization };
    const updated = await AdCategory.update(categoryId, { customization: merged });

    res.json({ success: true, message: 'Customization saved successfully', customization: updated.customization, timestamp: Date.now() });
  } catch (error) {
    console.error('Error saving customization:', error);
    res.status(500).json({ error: 'Failed to save customization', message: error.message });
  }
});

router.patch('/category/:categoryId/language', categoryController.updateCategoryLanguage);
router.get('/pending/:ownerId', categoryController.getPendingAds);
router.put('/approve/:adId/website/:websiteId', categoryController.approveAdForWebsite);
router.post('/reject/:adId/:websiteId/:categoryId', adRejectionController.rejectAd);
router.put('/:categoryId/reset-user-count', categoryController.resetUserCount);
router.delete('/:categoryId', categoryController.deleteCategory);

// ── WILDCARD — must be last ──────────────────────────────────────────────────
router.get('/:websiteId/advertiser', categoryController.getCategoriesByWebsiteForAdvertisers);
router.get('/:websiteId', categoryController.getCategoriesByWebsite);

module.exports = router;
