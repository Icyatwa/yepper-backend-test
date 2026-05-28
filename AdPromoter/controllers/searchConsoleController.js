// searchConsoleController.js
// Handles Google Search Console OAuth connect + data fetching per website
const { google } = require('googleapis');
const Website = require('../models/CreateWebsiteModel');
const jwt = require('jsonwebtoken');

// ── Build an OAuth2 client for Search Console ─────────────────────────────────
// We request the webmasters.readonly scope (Search Console read access).
// This is a SEPARATE OAuth grant from the login OAuth — the user connects
// Search Console explicitly per website, and we store tokens on the website doc.

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BACKEND_URL || 'https://yepper-backend-test.onrender.com'}/api/analytics/gsc/callback`
  );
}

// ── Helper: get authenticated user from JWT header ────────────────────────────
function getUserIdFromToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.userId;
  } catch {
    return null;
  }
}

// ── GET /api/analytics/gsc/connect/:websiteId ─────────────────────────────────
// Returns the Google OAuth URL the frontend should redirect the user to.
exports.getConnectUrl = async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { websiteId } = req.params;

  // Verify the website belongs to this user
  const website = await Website.findOne({ _id: websiteId, ownerId: userId });
  if (!website) return res.status(404).json({ error: 'Website not found' });

  const oauth2Client = makeOAuth2Client();

  // Encode websiteId + userId in the state param so we know which website
  // to attach the tokens to when the callback comes back
  const state = Buffer.from(JSON.stringify({ websiteId, userId })).toString('base64');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // we need a refresh token for future fetches
    prompt: 'consent',        // force consent screen so refresh_token is always returned
    scope: SCOPES,
    state,
  });

  res.json({ url });
};

// ── GET /api/analytics/gsc/callback ──────────────────────────────────────────
// Google redirects here after the user grants (or denies) access.
exports.oauthCallback = async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.yepper.cc';
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}/gsc-connect?status=denied`);
  }

  let websiteId, userId;
  try {
    ({ websiteId, userId } = JSON.parse(Buffer.from(state, 'base64').toString()));
  } catch {
    return res.redirect(`${FRONTEND_URL}/gsc-connect?status=error`);
  }

  try {
    const oauth2Client = makeOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Fetch the list of verified sites so we can auto-match the website URL
    oauth2Client.setCredentials(tokens);
    const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
    const sitesRes = await searchconsole.sites.list();
    const sites = sitesRes.data.siteEntry || [];

    // Try to match the website's URL to one of the user's verified GSC properties
    const website = await Website.findOne({ _id: websiteId, ownerId: userId });
    if (!website) {
      return res.redirect(`${FRONTEND_URL}/gsc-connect?status=error&reason=website_not_found`);
    }

    // Find a GSC site that matches the website URL (try both www and non-www)
    const websiteUrl = website.websiteLink.replace(/\/$/, '');
    const matchedSite = sites.find(s => {
      const siteUrl = s.siteUrl.replace(/\/$/, '');
      return (
        siteUrl === websiteUrl ||
        siteUrl === websiteUrl.replace('https://www.', 'https://') ||
        siteUrl === websiteUrl.replace('https://', 'https://www.') ||
        siteUrl === `sc-domain:${websiteUrl.replace(/https?:\/\/(www\.)?/, '')}`
      );
    });

    // Save tokens + matched site URL to the website document
    website.gscAccessToken = tokens.access_token;
    if (tokens.refresh_token) {
      website.gscRefreshToken = tokens.refresh_token;
    }
    website.gscSiteUrl = matchedSite ? matchedSite.siteUrl : null;
    website.gscConnectedAt = new Date();
    await website.save();

    if (!matchedSite) {
      // Connected but no matching site found — let user know
      return res.redirect(
        `${FRONTEND_URL}/websites/${websiteId}?gsc=connected_no_site&tab=analytics`
      );
    }

    res.redirect(`${FRONTEND_URL}/websites/${websiteId}?gsc=connected&tab=analytics`);
  } catch (err) {
    console.error('GSC OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/gsc-connect?status=error`);
  }
};

// ── GET /api/analytics/gsc/data/:websiteId ───────────────────────────────────
// Returns Search Console performance data for the last 28 days.
exports.getGscData = async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { websiteId } = req.params;

  try {
    const website = await Website.findOne({ _id: websiteId, ownerId: userId });
    if (!website) return res.status(404).json({ error: 'Website not found' });

    if (!website.gscAccessToken) {
      return res.json({ connected: false });
    }

    if (!website.gscSiteUrl) {
      return res.json({ connected: true, siteMatched: false });
    }

    const oauth2Client = makeOAuth2Client();
    oauth2Client.setCredentials({
      access_token: website.gscAccessToken,
      refresh_token: website.gscRefreshToken,
    });

    // Auto-refresh access token if expired and save new tokens
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        website.gscAccessToken = tokens.access_token;
        if (tokens.refresh_token) website.gscRefreshToken = tokens.refresh_token;
        await website.save();
      }
    });

    const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

    // Date range: last 28 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);
    const fmt = (d) => d.toISOString().split('T')[0];

    // 1. Summary totals (no dimension = aggregate)
    const summaryRes = await searchconsole.searchanalytics.query({
      siteUrl: website.gscSiteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        type: 'web',
      },
    });

    const summary = summaryRes.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    // 2. Top pages by clicks
    const pagesRes = await searchconsole.searchanalytics.query({
      siteUrl: website.gscSiteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['page'],
        rowLimit: 10,
        type: 'web',
      },
    });

    // 3. Top queries by clicks
    const queriesRes = await searchconsole.searchanalytics.query({
      siteUrl: website.gscSiteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['query'],
        rowLimit: 10,
        type: 'web',
      },
    });

    // 4. Clicks by day (for a simple sparkline)
    const byDayRes = await searchconsole.searchanalytics.query({
      siteUrl: website.gscSiteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['date'],
        type: 'web',
      },
    });

    res.json({
      connected: true,
      siteMatched: true,
      siteUrl: website.gscSiteUrl,
      connectedAt: website.gscConnectedAt,
      dateRange: { start: fmt(startDate), end: fmt(endDate) },
      summary: {
        clicks: Math.round(summary.clicks || 0),
        impressions: Math.round(summary.impressions || 0),
        ctr: parseFloat(((summary.ctr || 0) * 100).toFixed(1)),        // as %
        position: parseFloat((summary.position || 0).toFixed(1)),
      },
      topPages: (pagesRes.data.rows || []).map(r => ({
        page: r.keys[0],
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr: parseFloat((r.ctr * 100).toFixed(1)),
        position: parseFloat(r.position.toFixed(1)),
      })),
      topQueries: (queriesRes.data.rows || []).map(r => ({
        query: r.keys[0],
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr: parseFloat((r.ctr * 100).toFixed(1)),
        position: parseFloat(r.position.toFixed(1)),
      })),
      byDay: (byDayRes.data.rows || []).map(r => ({
        date: r.keys[0],
        clicks: Math.round(r.clicks),
        impressions: Math.round(r.impressions),
      })),
    });
  } catch (err) {
    console.error('GSC data fetch error:', err.message);

    // If the token was revoked, clear the stored tokens
    if (err.code === 401 || err.status === 401) {
      await Website.findByIdAndUpdate(websiteId, {
        $unset: { gscAccessToken: '', gscRefreshToken: '', gscSiteUrl: '', gscConnectedAt: '' }
      });
      return res.json({ connected: false, reason: 'token_revoked' });
    }

    res.status(500).json({ error: 'Failed to fetch Search Console data', detail: err.message });
  }
};

// ── DELETE /api/analytics/gsc/disconnect/:websiteId ──────────────────────────
exports.disconnect = async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { websiteId } = req.params;

  try {
    const website = await Website.findOne({ _id: websiteId, ownerId: userId });
    if (!website) return res.status(404).json({ error: 'Website not found' });

    // Optionally revoke the token with Google
    if (website.gscAccessToken) {
      try {
        const oauth2Client = makeOAuth2Client();
        oauth2Client.setCredentials({ access_token: website.gscAccessToken });
        await oauth2Client.revokeCredentials();
      } catch {
        // Non-fatal — token may already be expired
      }
    }

    await Website.findByIdAndUpdate(websiteId, {
      $unset: { gscAccessToken: '', gscRefreshToken: '', gscSiteUrl: '', gscConnectedAt: '' }
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};
