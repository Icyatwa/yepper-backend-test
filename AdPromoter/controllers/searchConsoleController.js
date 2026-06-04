// searchConsoleController.js
// Handles Google Search Console OAuth connect + data fetching per website.
//
// TOKEN PRIORITY:
//   1. User-level tokens (stored on the User doc when the user signed in with Google).
//      If the user authenticated via Google on the login/register page, these are
//      already present and NO separate "Connect Search Console" step is needed.
//   2. Website-level tokens (stored on the Website doc via the explicit connect flow).
//      Kept as fallback for users who signed up with email/password.

const { google } = require('googleapis');
const Website = require('../models/CreateWebsiteModel');
const User    = require('../../models/User');
const jwt     = require('jsonwebtoken');

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BACKEND_URL || 'https://yepper-backend.onrender.com'}/api/analytics/gsc/callback`
  );
}

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

// Build an authenticated OAuth2 client using whichever tokens are available.
// Returns null if no tokens exist anywhere.
async function getAuthClient(user, website) {
  // Prefer user-level tokens (from Google sign-in)
  const accessToken  = user?.gscAccessToken  || website?.gscAccessToken;
  const refreshToken = user?.gscRefreshToken || website?.gscRefreshToken;

  if (!accessToken) return null;

  const oauth2Client = makeOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  // When tokens are refreshed, persist them back to the right doc
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      if (user?.gsc_access_token || user?.gscAccessToken) {
        const fields = { gscAccessToken: tokens.access_token };
        if (tokens.refresh_token) fields.gscRefreshToken = tokens.refresh_token;
        await User.update(user.id, fields).catch(() => {});
      } else if (website) {
        const fields = { gscAccessToken: tokens.access_token };
        if (tokens.refresh_token) fields.gscRefreshToken = tokens.refresh_token;
        await Website.update(website.id, fields).catch(() => {});
      }
    }
  });

  return oauth2Client;
}

// ── GET /api/analytics/gsc/connect/:websiteId ────────────────────────────────
// Returns the Google OAuth URL.
// If the user already has GSC tokens (from Google sign-in) we just return
// { alreadyConnected: true } so the frontend can skip the OAuth dance.
exports.getConnectUrl = async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { websiteId } = req.params;

  const [website, user] = await Promise.all([
    Website.findById(websiteId),
    User.findById(userId),
  ]);

  if (!website || website.owner_id?.toString() !== userId?.toString()) {
    return res.status(404).json({ error: 'Website not found' });
  }

  // If the user already has tokens from their Google sign-in, no extra flow needed
  if (user?.gscAccessToken) {
    return res.json({ alreadyConnected: true });
  }

  const oauth2Client = makeOAuth2Client();
  const state = Buffer.from(JSON.stringify({ websiteId, userId })).toString('base64');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });

  res.json({ url });
};

// ── GET /api/analytics/gsc/callback ─────────────────────────────────────────
exports.oauthCallback = async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.yepper.cc';
  const { code, state, error } = req.query;

  if (error) return res.redirect(`${FRONTEND_URL}/gsc-connect?status=denied`);

  let websiteId, userId;
  try {
    ({ websiteId, userId } = JSON.parse(Buffer.from(state, 'base64').toString()));
  } catch {
    return res.redirect(`${FRONTEND_URL}/gsc-connect?status=error`);
  }

  try {
    const oauth2Client = makeOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
    const sitesRes = await searchconsole.sites.list();
    const sites = sitesRes.data.siteEntry || [];

    const website = await Website.findById(websiteId);
    if (!website || website.owner_id?.toString() !== userId?.toString()) return res.redirect(`${FRONTEND_URL}/gsc-connect?status=error&reason=website_not_found`);

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

    await Website.update(website.id, {
      gscAccessToken: tokens.access_token,
      ...(tokens.refresh_token ? { gscRefreshToken: tokens.refresh_token } : {}),
      gscSiteUrl: matchedSite ? matchedSite.siteUrl : null,
      gscConnectedAt: new Date(),
    });

    if (!matchedSite) {
      return res.redirect(`${FRONTEND_URL}/websites/${websiteId}?gsc=connected_no_site&tab=analytics`);
    }

    res.redirect(`${FRONTEND_URL}/websites/${websiteId}?gsc=connected&tab=analytics`);
  } catch (err) {
    console.error('GSC OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/gsc-connect?status=error`);
  }
};

// ── GET /api/analytics/gsc/data/:websiteId ───────────────────────────────────
exports.getGscData = async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { websiteId } = req.params;

  try {
    const [website, user] = await Promise.all([
      Website.findById(websiteId),
      User.findById(userId),
    ]);

    if (!website || website.owner_id?.toString() !== userId?.toString()) return res.status(404).json({ error: 'Website not found' });

    // Determine if we have any tokens at all
    const hasUserTokens    = !!(user?.gsc_access_token || user?.gscAccessToken);
    const hasWebsiteTokens = !!(website?.gsc_access_token || website?.gscAccessToken);

    if (!hasUserTokens && !hasWebsiteTokens) {
      return res.json({ connected: false });
    }

    // Build the auth client
    const oauth2Client = await getAuthClient(user, website);
    if (!oauth2Client) return res.json({ connected: false });

    // Resolve the GSC site URL to query against.
    // Prefer the already-matched URL saved on the website doc.
    // If missing (user connected via Google login but never ran the per-website flow),
    // auto-match by listing the user's verified GSC properties.
    let siteUrl = website.gsc_site_url || website.gscSiteUrl;

    if (!siteUrl) {
      try {
        const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
        const sitesRes = await searchconsole.sites.list();
        const sites    = sitesRes.data.siteEntry || [];

        const websiteUrl = website.websiteLink?.replace(/\/$/, '') || '';
        const matched    = sites.find(s => {
          const su = s.siteUrl.replace(/\/$/, '');
          return (
            su === websiteUrl ||
            su === websiteUrl.replace('https://www.', 'https://') ||
            su === websiteUrl.replace('https://', 'https://www.') ||
            su === `sc-domain:${websiteUrl.replace(/https?:\/\/(www\.)?/, '')}`
          );
        });

        if (matched) {
          siteUrl = matched.siteUrl;
          // Cache it on the website so we don't repeat the lookup
          await Website.update(website.id, {
            gscSiteUrl: siteUrl,
            gscConnectedAt: website.gsc_connected_at || website.gscConnectedAt || new Date(),
          }).catch(() => {});
        } else {
          // Return the list of available sites so the frontend can let the user pick
          return res.json({
            connected: true,
            siteMatched: false,
            availableSites: sites.map(s => s.siteUrl),
          });
        }
      } catch (err) {
        console.error('GSC site list error:', err.message);
        return res.json({ connected: true, siteMatched: false, availableSites: [] });
      }
    }

    // Fetch performance data
    const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });

    const endDate   = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);
    const fmt = (d) => d.toISOString().split('T')[0];

    const [summaryRes, pagesRes, queriesRes, byDayRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: { startDate: fmt(startDate), endDate: fmt(endDate), type: 'web' },
      }),
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: { startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ['page'],  rowLimit: 10, type: 'web' },
      }),
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: { startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ['query'], rowLimit: 10, type: 'web' },
      }),
      searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: { startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ['date'],  type: 'web' },
      }),
    ]);

    const summary = summaryRes.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    res.json({
      connected:    true,
      siteMatched:  true,
      connectedVia: hasUserTokens ? 'google_login' : 'manual',
      siteUrl,
      connectedAt:  website.gsc_connected_at || website.gscConnectedAt,
      dateRange:    { start: fmt(startDate), end: fmt(endDate) },
      summary: {
        clicks:      Math.round(summary.clicks      || 0),
        impressions: Math.round(summary.impressions || 0),
        ctr:         parseFloat(((summary.ctr       || 0) * 100).toFixed(1)),
        position:    parseFloat((summary.position   || 0).toFixed(1)),
      },
      topPages: (pagesRes.data.rows || []).map(r => ({
        page:        r.keys[0],
        clicks:      Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr:         parseFloat((r.ctr * 100).toFixed(1)),
        position:    parseFloat(r.position.toFixed(1)),
      })),
      topQueries: (queriesRes.data.rows || []).map(r => ({
        query:       r.keys[0],
        clicks:      Math.round(r.clicks),
        impressions: Math.round(r.impressions),
        ctr:         parseFloat((r.ctr * 100).toFixed(1)),
        position:    parseFloat(r.position.toFixed(1)),
      })),
      byDay: (byDayRes.data.rows || []).map(r => ({
        date:        r.keys[0],
        clicks:      Math.round(r.clicks),
        impressions: Math.round(r.impressions),
      })),
    });
  } catch (err) {
    console.error('GSC data fetch error:', err.message);

    if (err.code === 401 || err.status === 401) {
      // Clear stale tokens from wherever they came from
      await Promise.allSettled([
        Website.update(websiteId, { gscAccessToken: null, gscRefreshToken: null, gscSiteUrl: null, gscConnectedAt: null }),
        User.update(userId, { gscAccessToken: null, gscRefreshToken: null }),
      ]);
      return res.json({ connected: false, reason: 'token_revoked' });
    }

    res.status(500).json({ error: 'Failed to fetch Search Console data', detail: err.message });
  }
};

// ── DELETE /api/analytics/gsc/disconnect/:websiteId ─────────────────────────
exports.disconnect = async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { websiteId } = req.params;

  try {
    const website = await Website.findById(websiteId);
    if (!website || website.owner_id?.toString() !== userId?.toString()) return res.status(404).json({ error: 'Website not found' });

    // Revoke whichever token we can
    const tokenToRevoke = website.gsc_access_token || website.gscAccessToken;
    if (tokenToRevoke) {
      try {
        const oauth2Client = makeOAuth2Client();
        oauth2Client.setCredentials({ access_token: tokenToRevoke });
        await oauth2Client.revokeCredentials();
      } catch {
        // Non-fatal
      }
    }

    await Website.update(websiteId, { gscAccessToken: null, gscRefreshToken: null, gscSiteUrl: null, gscConnectedAt: null });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};