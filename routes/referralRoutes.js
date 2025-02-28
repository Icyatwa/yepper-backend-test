// routes/referralRoutes.js
const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');

// Routes
router.post('/generate-code', referralController.generateCode);
router.post('/record-referral', referralController.recordReferral);
router.post('/complete-referral', referralController.completeReferral);
router.get('/stats/:userId', referralController.getReferralStats);
router.post('/check-qualifications', referralController.checkQualifications);

module.exports = router;