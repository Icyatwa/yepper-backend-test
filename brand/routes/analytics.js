// Analytics.js
const express = require('express');
const router = express.Router();
const {
  refreshAnalytics,
  getAnalyticsHistory,
  getCurrentAnalytics,
  getOverview
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.post('/refresh/:platform', protect, refreshAnalytics);
router.get('/overview/all', protect, getOverview);
router.get('/:platform/current', protect, getCurrentAnalytics);
router.get('/:platform', protect, getAnalyticsHistory);

module.exports = router;