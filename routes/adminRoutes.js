// routes/adminRoutes.js
const express = require('express');
const router  = express.Router();
const adminAuth      = require('../middleware/adminAuth');
const authMiddleware = require('../middleware/authmiddleware');
const ctrl = require('../controllers/adminController');

// ── Public: credential verification — this is the login endpoint ─────────────
// Accepts { ref, token } in body and validates against ADMIN_NAME / ADMIN_SECRET
router.post('/init', (req, res) => {
  const { ref, token } = req.body || {};

  const validRef   = process.env.ADMIN_NAME;
  const validToken = process.env.ADMIN_SECRET;

  if (
    !ref || !token || !validRef || !validToken ||
    ref !== validRef || token !== validToken
  ) {
    // Intentionally generic — reveals nothing about which field failed
    return res.status(403).json({ success: false, code: 'ERR_NODE_AUTH' });
  }

  res.json({ success: true });
});

// ── Protected admin routes (require x-node-ref + x-node-key headers) ─────────
router.get('/users',                           adminAuth, ctrl.getUsers);
router.get('/users/:userId',                   adminAuth, ctrl.getUserDetail);
router.get('/grants',                          adminAuth, ctrl.getGrants);
router.get('/stats',                           adminAuth, ctrl.getStats);
router.post('/grants',                         adminAuth, ctrl.createGrant);
router.delete('/grants/:grantId',              adminAuth, ctrl.revokeGrant);
router.post('/grants/:grantId/resend-email',   adminAuth, ctrl.resendGrantEmail);

// ── Public token-validation endpoints (no admin auth — anyone with the token) ─
router.get('/grant-check',  ctrl.checkGrantToken);
router.post('/grant-apply', ctrl.applyGrant);

// ── User content (websites, ad spaces, ads) ───────────────────────────────────
router.get('/users/:userId/content',                                        adminAuth, ctrl.getUserContent);
router.get('/users/:userId/websites/:websiteId/advertiser-check',           adminAuth, ctrl.checkWebsiteAdvertisers);
router.get('/users/:userId/ad-spaces/:spaceId/advertiser-check',            adminAuth, ctrl.checkAdSpaceAdvertisers);
router.delete('/users/:userId/websites/:websiteId',                         adminAuth, ctrl.deleteWebsite);
router.delete('/users/:userId/ad-spaces/:spaceId',                          adminAuth, ctrl.deleteAdSpace);
router.delete('/users/:userId/ads/:adId',                                   adminAuth, ctrl.deleteAd);

// ── User-facing endpoint (requires user JWT) ──────────────────────────────────
router.get('/user-grant-status', authMiddleware, ctrl.getUserGrantStatus);

module.exports = router;