// analyticsController.js
const PageView = require('../models/WebsiteAnalyticsModel');
const Website  = require('../models/CreateWebsiteModel');
const User     = require('../../models/User');
const jwt      = require('jsonwebtoken');

// ── device detection (no external dep) ────────────────────────────────────────
function detectDevice(ua = '') {
  const s = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|mediapartners/i.test(s)) return 'bot';
  if (/tablet|ipad/i.test(s)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(s)) return 'mobile';
  if (s) return 'desktop';
  return 'unknown';
}

// ── auth helper (same pattern as createWebsiteController) ─────────────────────
async function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    return await User.findById(decoded.userId).lean();
  } catch {
    return null;
  }
}

// ── POST /api/analytics/track ─────────────────────────────────────────────────
// Called by the site script on every page load (fire-and-forget from the browser)
exports.trackPageView = async (req, res) => {
  // Always respond immediately so the visitor's page isn't blocked
  // (CORS headers are set by the server-level middleware in server.js)
  res.status(202).json({ ok: true });

  try {
    const { websiteId, path: pagePath, referrer } = req.body;
    if (!websiteId) return;

    // Skip bots
    const ua = req.headers['user-agent'] || '';
    const device = detectDevice(ua);
    if (device === 'bot') return;

    // Resolve real IP (handle proxies / Render / Railway)
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      '';

    // Geo lookup via ip-api (free, no key needed, 45 req/min per IP)
    let country = 'Unknown', countryCode = '', city = 'Unknown', region = '', lat = null, lon = null;
    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,regionName,lat,lon`);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo.status === 'success') {
          country     = geo.country     || 'Unknown';
          countryCode = geo.countryCode || '';
          city        = geo.city        || 'Unknown';
          region      = geo.regionName  || '';
          lat         = geo.lat         ?? null;
          lon         = geo.lon         ?? null;
        }
      }
    } catch { /* geo failure is non-fatal */ }

    await PageView.create({
      websiteId,
      ip,
      country,
      countryCode,
      city,
      region,
      lat,
      lon,
      device,
      referrer: referrer || '',
      path: pagePath || '/',
    });

    // Update website's monthlyTraffic with rolling 30-day count
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthlyCount = await PageView.countDocuments({ websiteId, timestamp: { $gte: since } });

    // Compute tier
    let trafficTier = 'starter';
    if (monthlyCount > 200000) trafficTier = 'elite';
    else if (monthlyCount > 50000) trafficTier = 'premium';
    else if (monthlyCount > 10000) trafficTier = 'standard';
    else if (monthlyCount > 2000)  trafficTier = 'basic';

    await Website.findByIdAndUpdate(websiteId, { monthlyTraffic: monthlyCount, trafficTier });
  } catch (err) {
    console.error('trackPageView error:', err.message);
  }
};

// ── OPTIONS pre-flight ─────────────────────────────────────────────────────────
exports.trackOptions = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
};

// ── GET /api/analytics/:websiteId?range=7|30|90 ───────────────────────────────
exports.getAnalytics = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { websiteId } = req.params;
    const days = parseInt(req.query.range) || 30;

    const website = await Website.findById(websiteId).lean();
    if (!website) return res.status(404).json({ message: 'Website not found' });
    if (website.ownerId !== user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalViews,
      byCountry,
      byDevice,
      byDay,
      topReferrers,
      topPages,
      recentLocations,
    ] = await Promise.all([
      // total views in range
      PageView.countDocuments({ websiteId, timestamp: { $gte: since } }),

      // views by country
      PageView.aggregate([
        { $match: { websiteId, timestamp: { $gte: since } } },
        { $group: { _id: '$country', countryCode: { $first: '$countryCode' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),

      // views by device
      PageView.aggregate([
        { $match: { websiteId, timestamp: { $gte: since } } },
        { $group: { _id: '$device', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // daily view counts for chart
      PageView.aggregate([
        { $match: { websiteId, timestamp: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // top referrers
      PageView.aggregate([
        { $match: { websiteId, timestamp: { $gte: since }, referrer: { $ne: '' } } },
        { $group: { _id: '$referrer', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // top pages
      PageView.aggregate([
        { $match: { websiteId, timestamp: { $gte: since } } },
        { $group: { _id: '$path', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // recent geo points for the map (lat/lon, last 500)
      PageView.find(
        { websiteId, timestamp: { $gte: since }, lat: { $ne: null } },
        { lat: 1, lon: 1, country: 1, city: 1, device: 1, timestamp: 1 }
      )
        .sort({ timestamp: -1 })
        .limit(500)
        .lean(),
    ]);

    // Unique visitors by IP in range
    const uniqueVisitors = await PageView.distinct('ip', {
      websiteId,
      timestamp: { $gte: since },
      ip: { $ne: '' },
    }).then(ips => ips.length);

    res.json({
      totalViews,
      uniqueVisitors,
      monthlyTraffic: website.monthlyTraffic || 0,
      trafficTier:    website.trafficTier    || 'starter',
      byCountry:      byCountry.map(r => ({ country: r._id, countryCode: r.countryCode, count: r.count })),
      byDevice:       byDevice.map(r => ({ device: r._id, count: r.count })),
      byDay:          byDay.map(r => ({ date: r._id, count: r.count })),
      topReferrers:   topReferrers.map(r => ({ referrer: r._id, count: r.count })),
      topPages:       topPages.map(r => ({ path: r._id, count: r.count })),
      mapPoints:      recentLocations.map(r => ({
        lat:       r.lat,
        lon:       r.lon,
        country:   r.country,
        city:      r.city,
        device:    r.device,
        timestamp: r.timestamp,
      })),
    });
  } catch (err) {
    console.error('getAnalytics error:', err.message);
    res.status(500).json({ message: 'Failed to fetch analytics', error: err.message });
  }
};