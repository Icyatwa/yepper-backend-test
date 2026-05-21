// Analyticscontroller.js
const Analytics = require('../models/Analytics');
const Brand_User = require('../models/User');
const { buildMonthlySnapshot: igSnapshot } = require('./instagramService');
const { buildMonthlySnapshot: ytSnapshot, refreshYouTubeToken } = require('./youtubeService');
const { generateAIInsights } = require('./aiInsights');

exports.refreshAnalytics = async (req, res) => {
  try {
    const { platform } = req.params;
    const user = await Brand_User.findById(req.user._id);
    const account = user.getSocialAccount(platform);

    if (!account) return res.status(400).json({ error: `${platform} not connected` });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    let accessToken = account.accessToken;
    if (platform === 'youtube' && account.tokenExpiry && new Date() > account.tokenExpiry) {
      const refreshed = await refreshYouTubeToken(account.refreshToken);
      accessToken = refreshed.access_token;
      account.accessToken = accessToken;
      account.tokenExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
      await user.save();
    }

    let snapshot;
    if (platform === 'instagram') {
      snapshot = await igSnapshot(accessToken, account.platformUserId, year, month);
    } else if (platform === 'youtube') {
      snapshot = await ytSnapshot(accessToken, account.platformUserId, year, month);
    }

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const prevAnalytics = await Analytics.findOne({ userId: req.user._id, platform, month: prevKey });

    const aiInsights = await generateAIInsights(platform, snapshot, prevAnalytics?.snapshot || null);

    const analytics = await Analytics.findOneAndUpdate(
      { userId: req.user._id, platform, month: monthKey },
      { snapshot, aiInsights: { ...aiInsights, generatedAt: new Date() }, fetchedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json(analytics);
  } catch (err) {
    console.error('Analytics refresh error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAnalyticsHistory = async (req, res) => {
  try {
    const { platform } = req.params;
    const { months = 6 } = req.query;

    const analytics = await Analytics.find({ userId: req.user._id, platform })
      .sort({ month: -1 })
      .limit(parseInt(months));

    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCurrentAnalytics = async (req, res) => {
  try {
    const { platform } = req.params;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const analytics = await Analytics.findOne({ userId: req.user._id, platform, month: monthKey });

    if (!analytics) return res.status(404).json({ error: 'No data for current month. Click Refresh to fetch.' });

    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const analytics = await Analytics.find({ userId: req.user._id, month: monthKey });

    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};