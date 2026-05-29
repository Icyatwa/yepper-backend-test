// earningsController.js
// Returns earnings estimate for a category based on REAL analytics traffic.
// If analytics cannot be reached or no traffic exists, returns { available: false }.

const AdCategory = require('../models/CreateCategoryModel');
const Website    = require('../models/CreateWebsiteModel');
const PageView   = require('../models/WebsiteAnalyticsModel');
const jwt        = require('jsonwebtoken');
const User       = require('../../models/User');

const TRAFFIC_TIERS = [
  { tier: 'starter',  min: 500,    max: 2000,   basePrice: 6000   },
  { tier: 'basic',    min: 2001,   max: 10000,  basePrice: 15000  },
  { tier: 'standard', min: 10001,  max: 50000,  basePrice: 35000  },
  { tier: 'premium',  min: 50001,  max: 200000, basePrice: 80000  },
  { tier: 'elite',    min: 200001, max: Infinity,basePrice: 180000 },
];

const FORMAT_MULTIPLIERS = {
  'header':             1.0,
  'above the fold':     1.0,
  'bottom':             1.0,
  'pro footer':         1.0,
  'profooter':          1.0,
  'beneath title':      1.1,
  'in feed':            1.1,
  'inline content':     1.1,
  'left rail':          1.1,
  'rightrail':          1.1,
  'sidebar':            1.3,
  'stickysidebar':      1.3,
  'skyscraper':         1.3,
  'floating':           1.6,
  'modalpic':           1.6,
  'overlay':            1.6,
  'mobile interstitial':1.6,
};

function getTierFromTraffic(v) {
  return TRAFFIC_TIERS.find(t => v >= t.min && v <= t.max) || TRAFFIC_TIERS[0];
}

function computeEarnings(monthlyTraffic, spaceType) {
  const tier       = getTierFromTraffic(monthlyTraffic);
  const multiplier = FORMAT_MULTIPLIERS[(spaceType || '').toLowerCase()] || 1.0;
  const totalPrice = Math.round(tier.basePrice * multiplier);
  const ownerEarns = Math.round(totalPrice * 0.70);
  const yepperCut  = totalPrice - ownerEarns;
  return { tier: tier.tier, totalPrice, ownerEarns, yepperCut, monthlyTraffic };
}

async function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    return await User.findById(decoded.userId).lean();
  } catch { return null; }
}

// GET /api/ad-categories/earnings/:categoryId
// Returns { available: true, ...earningsData } or { available: false, reason }
exports.getCategoryEarnings = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const category = await AdCategory.findById(req.params.categoryId).lean();
    if (!category) return res.status(404).json({ message: 'Category not found' });
    if (category.ownerId !== user._id.toString())
      return res.status(403).json({ message: 'Forbidden' });

    const website = await Website.findById(category.websiteId).lean();
    if (!website) return res.status(404).json({ message: 'Website not found' });

    // Use real 30-day rolling traffic stored on the website record
    const monthlyTraffic = website.monthlyTraffic || 0;

    if (monthlyTraffic < 10) {
      // Script not yet installed or no traffic detected
      return res.json({
        available: false,
        reason: 'no_traffic',
        message: 'No traffic detected yet. Install your Yepper script and earnings will appear once visitors are tracked.'
      });
    }

    const earnings = computeEarnings(monthlyTraffic, category.spaceType);
    return res.json({ available: true, ...earnings });

  } catch (err) {
    console.error('getCategoryEarnings error:', err.message);
    res.status(500).json({ message: 'Failed to fetch earnings', error: err.message });
  }
};

// GET /api/websites/:websiteId/earnings-summary
// Returns earnings potential for ALL categories of a website
exports.getWebsiteEarningsSummary = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const website = await Website.findById(req.params.websiteId).lean();
    if (!website) return res.status(404).json({ message: 'Website not found' });
    if (website.ownerId !== user._id.toString())
      return res.status(403).json({ message: 'Forbidden' });

    const monthlyTraffic = website.monthlyTraffic || 0;
    const scriptInstalled = monthlyTraffic >= 10;

    const categories = await AdCategory.find({ websiteId: req.params.websiteId }).lean();

    if (!scriptInstalled) {
      return res.json({
        available: false,
        reason: 'no_traffic',
        message: 'Install your Yepper script to start tracking traffic. Earnings will appear once visitors are detected.',
        monthlyTraffic: 0,
        categories: categories.map(c => ({ categoryId: c._id, name: c.categoryName, available: false }))
      });
    }

    const summary = categories.map(c => {
      const e = computeEarnings(monthlyTraffic, c.spaceType);
      return { categoryId: c._id, name: c.categoryName, available: true, ...e };
    });

    const totalOwnerEarns = summary.reduce((s, c) => s + (c.ownerEarns || 0), 0);
    const tier = getTierFromTraffic(monthlyTraffic);

    return res.json({
      available: true,
      monthlyTraffic,
      trafficTier: tier.tier,
      totalOwnerEarnsPerMonth: totalOwnerEarns,
      categories: summary
    });

  } catch (err) {
    console.error('getWebsiteEarningsSummary error:', err.message);
    res.status(500).json({ message: 'Failed to fetch earnings summary', error: err.message });
  }
};
