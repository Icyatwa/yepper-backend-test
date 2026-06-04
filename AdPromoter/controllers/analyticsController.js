// analyticsController.js — PostgreSQL version
const { query } = require('../../config/db');
const PageView = require('../models/WebsiteAnalyticsModel');
const Website  = require('../models/CreateWebsiteModel');
const User     = require('../../models/User');
const jwt      = require('jsonwebtoken');

function detectDevice(ua = '') {
  const s = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|mediapartners/i.test(s)) return 'bot';
  if (/tablet|ipad/i.test(s)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(s)) return 'mobile';
  if (s) return 'desktop';
  return 'unknown';
}

async function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    return await User.findById(decoded.userId);
  } catch { return null; }
}

exports.trackPageView = async (req, res) => {
  res.status(202).json({ ok: true });
  try {
    const { websiteId, path: pagePath, referrer } = req.body;
    if (!websiteId) return;

    const ua = req.headers['user-agent'] || '';
    const device = detectDevice(ua);
    if (device === 'bot') return;

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';

    let country = 'Unknown', countryCode = '', city = 'Unknown', region = '', lat = null, lon = null;
    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,regionName,lat,lon`);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo.status === 'success') {
          country = geo.country || 'Unknown'; countryCode = geo.countryCode || '';
          city = geo.city || 'Unknown'; region = geo.regionName || '';
          lat = geo.lat ?? null; lon = geo.lon ?? null;
        }
      }
    } catch {}

    await PageView.create({ websiteId, ip, country, countryCode, city, region, lat, lon, device, referrer: referrer || '', path: pagePath || '/' });

    // Rolling 30-day count using PG
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const monthlyCount = await PageView.countByWebsite(websiteId, since);

    let trafficTier = 'unverified';
    if (monthlyCount >= 200001)       trafficTier = 'elite';
    else if (monthlyCount >= 50001)   trafficTier = 'premium';
    else if (monthlyCount >= 10001)   trafficTier = 'standard';
    else if (monthlyCount >= 2001)    trafficTier = 'basic';
    else if (monthlyCount >= 500)     trafficTier = 'starter';

    const website = await Website.findById(websiteId);
    if (!website) return;

    const updatePayload = { monthlyTraffic: monthlyCount, trafficTier };
    const now = new Date();

    if (!website.script_installed) {
      updatePayload.scriptInstalled   = true;
      updatePayload.scriptInstalledAt = now;
    }

    const isGscVerified = !!(website.gsc_site_url && website.gsc_site_url.trim());
    if (isGscVerified && !website.gsc_verified) {
      updatePayload.gscVerified     = true;
      updatePayload.gscVerifiedAt   = now;
      updatePayload.unverifiedSince = null;
    } else if (!isGscVerified && !website.unverified_since) {
      updatePayload.unverifiedSince = now;
    }

    if (website.granted_traffic_display != null) {
      const tierOrder = { unverified: 0, starter: 1, basic: 2, standard: 3, premium: 4, elite: 5 };
      if ((tierOrder[trafficTier] ?? 0) >= (tierOrder[website.granted_tier_display] ?? 0)) {
        updatePayload.grantedTrafficDisplay = null;
        updatePayload.grantedViewsDisplay   = null;
        updatePayload.grantedTierDisplay    = null;
        updatePayload.grantWindowExpiresAt  = null;
      }
    }

    await Website.update(websiteId, updatePayload);
  } catch (err) {
    console.error('trackPageView error:', err.message);
  }
};

exports.trackOptions = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(204).end();
};

exports.getAnalytics = async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { websiteId } = req.params;
    const days  = parseInt(req.query.range) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const website = await Website.findById(websiteId);
    if (!website) return res.status(404).json({ message: 'Website not found' });
    if (website.owner_id.toString() !== user.id.toString())
      return res.status(403).json({ message: 'Forbidden' });

    const [
      { rows: [{ count: totalViews }] },
      { rows: byCountry },
      { rows: byDevice },
      { rows: byDay },
      { rows: topReferrers },
      { rows: topPages },
      { rows: recentLocations },
      { rows: uniqueIps },
    ] = await Promise.all([
      query(`SELECT COUNT(*) FROM website_page_views WHERE website_id=$1 AND timestamp>=$2`, [websiteId, since]),
      query(`SELECT country, country_code, COUNT(*) as count FROM website_page_views WHERE website_id=$1 AND timestamp>=$2 GROUP BY country, country_code ORDER BY count DESC LIMIT 20`, [websiteId, since]),
      query(`SELECT device, COUNT(*) as count FROM website_page_views WHERE website_id=$1 AND timestamp>=$2 GROUP BY device ORDER BY count DESC`, [websiteId, since]),
      query(`SELECT TO_CHAR(timestamp,'YYYY-MM-DD') as date, COUNT(*) as count FROM website_page_views WHERE website_id=$1 AND timestamp>=$2 GROUP BY date ORDER BY date ASC`, [websiteId, since]),
      query(`SELECT referrer, COUNT(*) as count FROM website_page_views WHERE website_id=$1 AND timestamp>=$2 AND referrer<>'' GROUP BY referrer ORDER BY count DESC LIMIT 10`, [websiteId, since]),
      query(`SELECT path, COUNT(*) as count FROM website_page_views WHERE website_id=$1 AND timestamp>=$2 GROUP BY path ORDER BY count DESC LIMIT 10`, [websiteId, since]),
      query(`SELECT lat, lon, country, city, device, timestamp FROM website_page_views WHERE website_id=$1 AND timestamp>=$2 AND lat IS NOT NULL ORDER BY timestamp DESC LIMIT 500`, [websiteId, since]),
      query(`SELECT COUNT(DISTINCT ip) AS count FROM website_page_views WHERE website_id=$1 AND timestamp>=$2 AND ip<>''`, [websiteId, since]),
    ]);

    const mt = website.monthly_traffic || 0;
    let liveTier = 'unverified';
    if (mt >= 200001)       liveTier = 'elite';
    else if (mt >= 50001)   liveTier = 'premium';
    else if (mt >= 10001)   liveTier = 'standard';
    else if (mt >= 2001)    liveTier = 'basic';
    else if (mt >= 500)     liveTier = 'starter';

    const grantDisplay = website.granted_traffic_display != null ? {
      grantedTraffic: website.granted_traffic_display,
      grantedViews:   website.granted_views_display,
      trafficTier:    website.granted_tier_display,
      grantWindowExpiresAt: website.grant_window_expires_at,
    } : null;

    res.json({
      totalViews:     parseInt(totalViews),
      uniqueVisitors: parseInt(uniqueIps[0]?.count || 0),
      monthlyTraffic: mt,
      trafficTier:    liveTier,
      byCountry:      byCountry.map(r => ({ country: r.country, countryCode: r.country_code, count: parseInt(r.count) })),
      byDevice:       byDevice.map(r => ({ device: r.device, count: parseInt(r.count) })),
      byDay:          byDay.map(r => ({ date: r.date, count: parseInt(r.count) })),
      topReferrers:   topReferrers.map(r => ({ referrer: r.referrer, count: parseInt(r.count) })),
      topPages:       topPages.map(r => ({ path: r.path, count: parseInt(r.count) })),
      mapPoints:      recentLocations,
      grantDisplay,
    });
  } catch (err) {
    console.error('getAnalytics error:', err.message);
    res.status(500).json({ message: 'Failed to fetch analytics', error: err.message });
  }
};
