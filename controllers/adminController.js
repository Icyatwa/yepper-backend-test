// admin/controllers/adminController.js  — PostgreSQL version
const crypto   = require('crypto');
const { query } = require('../config/db');
const User        = require('../models/User');
const Website     = require('../AdPromoter/models/CreateWebsiteModel');
const TrafficGrant = require('../models/TrafficGrantModel');
const AdCategory  = require('../AdPromoter/models/CreateCategoryModel');
const ImportAd    = require('../AdOwner/models/WebAdvertiseModel');
const { Resend }  = require('resend');

const resend      = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://yepper.cc';

// ── helpers ──────────────────────────────────────────────────────────────────

const generateAccessToken = () => crypto.randomBytes(32).toString('hex');

const sendGrantEmail = async (user, grant, website) => {
  const link        = `${FRONTEND_URL}/traffic-grant?token=${grant.access_token}`;
  const websiteName = website ? website.website_name : 'your website';
  try {
    await resend.emails.send({
      from: 'Yepper <noreply@yepper.cc>',
      to: user.email,
      subject: `🎁 You've been granted a special analytics boost for ${websiteName}`,
      html: `
        <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,0.08);overflow:hidden;">
                <tr><td style="background:#000;padding:28px 40px;">
                  <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Yepper</h1>
                </td></tr>
                <tr><td style="padding:40px;">
                  <p style="color:#333;font-size:17px;margin:0 0 8px 0;">Hi <strong>${user.name}</strong>,</p>
                  <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                    Great news! You've been selected to customize your analytics data for
                    <strong>${websiteName}</strong>. Use the button below to set your traffic and views numbers —
                    they'll appear directly in your analytics dashboard.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td align="center" style="padding:10px 0 32px 0;">
                      <a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:16px 36px;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;letter-spacing:0.2px;">
                        Set My Analytics Numbers →
                      </a>
                    </td></tr>
                  </table>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
                    <tr><td>
                      <p style="color:#333;font-size:14px;font-weight:600;margin:0 0 10px 0;">What happens next?</p>
                      <ul style="color:#555;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                        <li>Click the button above (or find it on your website dashboard)</li>
                        <li>Enter the traffic &amp; views numbers you want displayed</li>
                        <li>They'll update automatically in your analytics</li>
                        <li>No need to log in again — your account is already linked</li>
                      </ul>
                    </td></tr>
                  </table>
                  <p style="color:#999;font-size:13px;line-height:1.5;margin:0;">
                    This link is personal to your account and expires in 7 days.
                    If you didn't expect this email, you can safely ignore it.
                  </p>
                </td></tr>
                <tr><td style="background:#fafafa;border-top:1px solid #eee;padding:20px 40px;">
                  <p style="color:#bbb;font-size:12px;margin:0;text-align:center;">
                    © ${new Date().getFullYear()} Yepper · <a href="${FRONTEND_URL}/privacy-policy" style="color:#bbb;">Privacy Policy</a>
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>`,
    });
    return true;
  } catch (err) {
    console.error('Failed to send grant email:', err);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users  — list all users with website counts + grant status
// ─────────────────────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lim    = parseInt(limit);

    let whereClause = '';
    const params    = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE name ILIKE $1 OR email ILIKE $1`;
    }

    const countRes = await query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const offsetIdx = params.length + 1;
    const limIdx    = params.length + 2;
    const usersRes  = await query(
      `SELECT id, name, email, avatar, is_verified, google_id, created_at, updated_at
       FROM users ${whereClause}
       ORDER BY created_at DESC
       OFFSET $${offsetIdx} LIMIT $${limIdx}`,
      [...params, offset, lim]
    );
    const users = usersRes.rows;

    if (users.length === 0) {
      return res.json({ success: true, users: [], total, page: parseInt(page), limit: lim });
    }

    const userIds = users.map(u => u.id);

    // Website counts per user
    const wcRes = await query(
      `SELECT owner_id, COUNT(*) AS cnt FROM websites WHERE owner_id = ANY($1::text[]) GROUP BY owner_id`,
      [userIds.map(String)]
    );
    const countMap = {};
    for (const r of wcRes.rows) countMap[r.owner_id] = parseInt(r.cnt, 10);

    // Latest grant status per user
    const grantRes = await query(
      `SELECT DISTINCT ON (user_id) user_id, status
       FROM traffic_grants
       WHERE user_id = ANY($1::int[]) AND status IN ('pending','completed')
       ORDER BY user_id, created_at DESC`,
      [userIds]
    );
    const grantMap = {};
    for (const r of grantRes.rows) grantMap[r.user_id] = r.status;

    const enriched = users.map(u => ({
      ...u,
      _id: u.id,          // keep _id alias for frontend compatibility
      isVerified: u.is_verified,
      websiteCount: countMap[String(u.id)] || 0,
      grantStatus:  grantMap[u.id] || null,
    }));

    res.json({ success: true, users: enriched, total, page: parseInt(page), limit: lim });
  } catch (err) {
    console.error('getUsers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:userId  — single user + their websites + grants
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [websites, grants] = await Promise.all([
      Website.findByOwner(userId),
      TrafficGrant.findByUser(userId),
    ]);

    // Normalise user fields for frontend
    const safeUser = {
      ...user,
      _id: user.id,
      isVerified: user.is_verified,
      googleId:   user.google_id,
    };
    delete safeUser.password;
    delete safeUser.gsc_access_token;
    delete safeUser.gsc_refresh_token;

    // Normalise websites
    const safeWebsites = websites.map(w => ({
      ...w,
      _id: w.id,
      websiteName:  w.website_name,
      websiteLink:  w.website_link,
      monthlyTraffic: w.monthly_traffic,
      trafficTier:  w.traffic_tier,
    }));

    // Normalise grants — attach website stub
    const websiteMap = {};
    for (const w of websites) websiteMap[String(w.id)] = w;

    const safeGrants = grants.map(g => ({
      ...g,
      _id: g.id,
      grantedTraffic: g.granted_traffic,
      grantedViews:   g.granted_views,
      grantedBy:      g.granted_by,
      expiresAt:      g.expires_at,
      websiteId: g.website_id ? {
        _id: g.website_id,
        websiteName: websiteMap[String(g.website_id)]?.website_name || null,
        websiteLink: websiteMap[String(g.website_id)]?.website_link || null,
      } : null,
    }));

    res.json({ success: true, user: safeUser, websites: safeWebsites, grants: safeGrants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/grants  — create a traffic grant for a user
// ─────────────────────────────────────────────────────────────────────────────
exports.createGrant = async (req, res) => {
  try {
    const { userId, websiteId, notes, expiryDays = 7 } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let website = null;
    if (websiteId) {
      website = await Website.findById(websiteId);
      if (!website) return res.status(404).json({ success: false, message: 'Website not found' });
    }

    // Revoke any existing pending grant for same user+website
    await query(
      `UPDATE traffic_grants SET status = 'revoked'
       WHERE user_id = $1 AND website_id IS NOT DISTINCT FROM $2 AND status = 'pending'`,
      [userId, websiteId || null]
    );

    const accessToken = generateAccessToken();
    const expiresAt   = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const grant = await TrafficGrant.create({
      userId,
      websiteId:   websiteId || null,
      accessToken,
      expiresAt,
      grantedBy:   req.admin.username,
      notes:       notes || '',
    });

    const emailOk = await sendGrantEmail(user, grant, website);
    if (emailOk) {
      await TrafficGrant.update(grant.id, { email_sent: true, email_sent_at: new Date() });
    }

    res.json({ success: true, grant, emailSent: emailOk });
  } catch (err) {
    console.error('createGrant error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/grants  — list all grants (with user + website info)
// ─────────────────────────────────────────────────────────────────────────────
exports.getGrants = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lim    = parseInt(limit);

    const params  = [];
    let where     = '';
    if (status) { params.push(status); where = `WHERE tg.status = $1`; }

    const countRes = await query(
      `SELECT COUNT(*) FROM traffic_grants tg ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const offsetIdx = params.length + 1;
    const limIdx    = params.length + 2;

    const { rows: grants } = await query(
      `SELECT tg.*,
              u.name  AS user_name,  u.email AS user_email,
              w.website_name, w.website_link
       FROM traffic_grants tg
       LEFT JOIN users    u ON u.id = tg.user_id
       LEFT JOIN websites w ON w.id = tg.website_id
       ${where}
       ORDER BY tg.created_at DESC
       OFFSET $${offsetIdx} LIMIT $${limIdx}`,
      [...params, offset, lim]
    );

    const shaped = grants.map(g => ({
      ...g,
      _id: g.id,
      grantedTraffic: g.granted_traffic,
      grantedViews:   g.granted_views,
      grantedBy:      g.granted_by,
      expiresAt:      g.expires_at,
      userId: g.user_id ? { _id: g.user_id, name: g.user_name, email: g.user_email } : null,
      websiteId: g.website_id ? { _id: g.website_id, websiteName: g.website_name, websiteLink: g.website_link } : null,
    }));

    res.json({ success: true, grants: shaped, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/grants/:grantId  — revoke a grant
// ─────────────────────────────────────────────────────────────────────────────
exports.revokeGrant = async (req, res) => {
  try {
    const grant = await TrafficGrant.update(req.params.grantId, { status: 'revoked' });
    if (!grant) return res.status(404).json({ success: false, message: 'Grant not found' });
    res.json({ success: true, grant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/grants/:grantId/resend-email
// ─────────────────────────────────────────────────────────────────────────────
exports.resendGrantEmail = async (req, res) => {
  try {
    const grant = await TrafficGrant.findById(req.params.grantId);
    if (!grant) return res.status(404).json({ success: false, message: 'Grant not found' });
    if (grant.status === 'revoked') return res.status(400).json({ success: false, message: 'Grant is revoked' });

    const user    = await User.findById(grant.user_id);
    const website = grant.website_id ? await Website.findById(grant.website_id) : null;

    const emailOk = await sendGrantEmail(user, grant, website);
    if (emailOk) {
      await TrafficGrant.update(grant.id, { email_sent: true, email_sent_at: new Date() });
    }
    res.json({ success: true, emailSent: emailOk });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats  — dashboard stats
// ─────────────────────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalWebsites, pendingGrants, completedGrants, newUsers7d] = await Promise.all([
      query(`SELECT COUNT(*) FROM users`),
      query(`SELECT COUNT(*) FROM websites`),
      query(`SELECT COUNT(*) FROM traffic_grants WHERE status = 'pending'`),
      query(`SELECT COUNT(*) FROM traffic_grants WHERE status = 'completed'`),
      query(`SELECT COUNT(*) FROM users WHERE created_at >= $1`, [since7d]),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers:     parseInt(totalUsers.rows[0].count, 10),
        totalWebsites:  parseInt(totalWebsites.rows[0].count, 10),
        pendingGrants:  parseInt(pendingGrants.rows[0].count, 10),
        completedGrants: parseInt(completedGrants.rows[0].count, 10),
        newUsers7d:     parseInt(newUsers7d.rows[0].count, 10),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/admin/grant-check?token=XXX
// ─────────────────────────────────────────────────────────────────────────────
exports.checkGrantToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const { rows } = await query(
      `SELECT tg.*,
              u.name AS user_name, u.email AS user_email, u.id AS user_id_val,
              w.website_name, w.website_link, w.id AS website_id_val,
              w.monthly_traffic, w.traffic_tier, w.granted_traffic_display, w.granted_views_display, w.granted_tier_display
       FROM traffic_grants tg
       LEFT JOIN users    u ON u.id = tg.user_id
       LEFT JOIN websites w ON w.id = tg.website_id
       WHERE tg.access_token = $1`,
      [token]
    );

    const grant = rows[0];
    if (!grant) return res.status(404).json({ success: false, message: 'Invalid or expired link' });
    if (grant.status === 'revoked')   return res.status(403).json({ success: false, message: 'This link has been revoked' });
    if (grant.status === 'completed') return res.json({ success: true, alreadyUsed: true, grant: shapeGrant(grant) });
    if (new Date() > new Date(grant.expires_at)) {
      await TrafficGrant.update(grant.id, { status: 'expired' });
      return res.status(410).json({ success: false, message: 'This link has expired' });
    }

    res.json({ success: true, alreadyUsed: false, grant: shapeGrant(grant) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

function shapeGrant(g) {
  return {
    ...g,
    _id: g.id,
    accessToken:    g.access_token,
    expiresAt:      g.expires_at,
    grantedTraffic: g.granted_traffic,
    grantedViews:   g.granted_views,
    userId: g.user_id ? { _id: g.user_id, name: g.user_name, email: g.user_email } : null,
    websiteId: g.website_id ? {
      _id: g.website_id_val,
      websiteName: g.website_name,
      websiteLink: g.website_link,
      monthlyTraffic: g.monthly_traffic,
      trafficTier: g.traffic_tier,
      grantedTrafficDisplay: g.granted_traffic_display,
      grantedViewsDisplay:   g.granted_views_display,
      grantedTierDisplay:    g.granted_tier_display,
    } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /api/admin/grant-apply
// ─────────────────────────────────────────────────────────────────────────────

const TIER_PRICES = {
  unverified: { 'Header':9000,'Above The Fold':7800,'Sticky Sidebar':6000,'Mobile Interstitial':6000,'Overlay':5400,'Floating':4800,'Modal':4200,'Left Rail':3600,'Right Rail':3600,'Sidebar':3000,'In Feed':2400,'Inline Content':2400,'Beneath Title':2100,'Pro Footer':1500,'Bottom':1200 },
  starter:    { 'Header':3000,'Above The Fold':2600,'Sticky Sidebar':2000,'Mobile Interstitial':2000,'Overlay':1800,'Floating':1600,'Modal':1400,'Left Rail':1200,'Right Rail':1200,'Sidebar':1000,'In Feed':800,'Inline Content':800,'Beneath Title':700,'Pro Footer':500,'Bottom':400 },
  basic:      { 'Header':15000,'Above The Fold':13000,'Sticky Sidebar':10000,'Mobile Interstitial':10000,'Overlay':9000,'Floating':8000,'Modal':7000,'Left Rail':6000,'Right Rail':6000,'Sidebar':5000,'In Feed':4000,'Inline Content':4000,'Beneath Title':3500,'Pro Footer':2500,'Bottom':2000 },
  standard:   { 'Header':30000,'Above The Fold':26000,'Sticky Sidebar':20000,'Mobile Interstitial':20000,'Overlay':18000,'Floating':16000,'Modal':14000,'Left Rail':12000,'Right Rail':12000,'Sidebar':10000,'In Feed':8000,'Inline Content':8000,'Beneath Title':7000,'Pro Footer':5000,'Bottom':4000 },
  premium:    { 'Header':82000,'Above The Fold':71000,'Sticky Sidebar':55000,'Mobile Interstitial':55000,'Overlay':49000,'Floating':44000,'Modal':38000,'Left Rail':33000,'Right Rail':33000,'Sidebar':27000,'In Feed':22000,'Inline Content':22000,'Beneath Title':19000,'Pro Footer':14000,'Bottom':11000 },
  elite:      { 'Header':220000,'Above The Fold':190000,'Sticky Sidebar':148000,'Mobile Interstitial':148000,'Overlay':132000,'Floating':118000,'Modal':102000,'Left Rail':88000,'Right Rail':88000,'Sidebar':73000,'In Feed':59000,'Inline Content':59000,'Beneath Title':51000,'Pro Footer':37000,'Bottom':29000 },
};

const SPACE_TYPE_MAP = {
  'Header':'Header','Above The Fold':'Above The Fold','Sticky Sidebar':'Sticky Sidebar',
  'stickySidebar':'Sticky Sidebar','Mobile Interstitial':'Mobile Interstitial',
  'mobileInterstial':'Mobile Interstitial','Overlay':'Overlay','overlay':'Overlay',
  'Floating':'Floating','floating':'Floating','Modal':'Modal','modalPic':'Modal',
  'Left Rail':'Left Rail','leftRail':'Left Rail','Right Rail':'Right Rail','rightRail':'Right Rail',
  'Sidebar':'Sidebar','sidebar':'Sidebar','In Feed':'In Feed','inFeed':'In Feed',
  'Inline Content':'Inline Content','inlineContent':'Inline Content',
  'Beneath Title':'Beneath Title','beneathTitle':'Beneath Title',
  'Pro Footer':'Pro Footer','proFooter':'Pro Footer','Bottom':'Bottom','bottom':'Bottom',
};

exports.applyGrant = async (req, res) => {
  try {
    const { token, traffic, views } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const grant = await TrafficGrant.findByToken(token);
    if (!grant) return res.status(404).json({ success: false, message: 'Invalid link' });
    if (grant.status !== 'pending') return res.status(400).json({ success: false, message: 'This grant is no longer active' });
    if (new Date() > new Date(grant.expires_at)) {
      await TrafficGrant.update(grant.id, { status: 'expired' });
      return res.status(410).json({ success: false, message: 'Link has expired' });
    }

    const trafficNum = Math.max(0, parseInt(traffic) || 0);
    const viewsNum   = Math.max(0, parseInt(views)   || 0);
    const displayNum = Math.max(trafficNum, viewsNum);

    let websiteId = grant.website_id;
    if (!websiteId) {
      const site = await Website.findByOwner(String(grant.user_id));
      if (!site || site.length === 0) return res.status(400).json({ success: false, message: 'No website found for your account' });
      websiteId = site[0].id;
    }

    let grantedTier = 'unverified';
    if (displayNum >= 200001)     grantedTier = 'elite';
    else if (displayNum >= 50001) grantedTier = 'premium';
    else if (displayNum >= 10001) grantedTier = 'standard';
    else if (displayNum >= 2001)  grantedTier = 'basic';
    else if (displayNum >= 500)   grantedTier = 'starter';

    await Website.update(websiteId, {
      trafficTier:           grantedTier,
      grantWindowExpiresAt:  null,
      grantedTrafficDisplay: trafficNum,
      grantedViewsDisplay:   viewsNum,
      grantedTierDisplay:    grantedTier,
    });

    // Reprice unpaid ad spaces
    const { rows: unpaidSpaces } = await query(
      `SELECT * FROM ad_categories WHERE website_id = $1
       AND (selected_ads IS NULL OR selected_ads = '[]'::jsonb)`,
      [websiteId]
    );

    const tierPrices = TIER_PRICES[grantedTier] || TIER_PRICES['unverified'];
    let spacesRepriced = 0;
    for (const space of unpaidSpaces) {
      const canonicalType = SPACE_TYPE_MAP[space.space_type] || space.space_type;
      const newPrice = tierPrices[canonicalType];
      if (newPrice !== undefined && newPrice !== space.price) {
        await query(
          `UPDATE ad_categories SET price = $1, tier = $2 WHERE id = $3`,
          [newPrice, grantedTier, space.id]
        );
        spacesRepriced++;
      }
    }

    await TrafficGrant.update(grant.id, {
      granted_traffic: trafficNum,
      granted_views:   viewsNum,
      status:          'completed',
      token_used:      true,
      token_used_at:   new Date(),
      completed_at:    new Date(),
    });

    res.json({
      success: true,
      message: 'Analytics updated successfully',
      grantedTraffic:  trafficNum,
      grantedViews:    viewsNum,
      trafficTier:     grantedTier,
      spacesRepriced,
    });
  } catch (err) {
    console.error('applyGrant error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/admin/user-grant-status?userId=XXX (requires user JWT)
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserGrantStatus = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    // Pending grant
    const { rows: pending } = await query(
      `SELECT tg.*, w.website_name, w.website_link, w.id AS w_id
       FROM traffic_grants tg
       LEFT JOIN websites w ON w.id = tg.website_id
       WHERE tg.user_id = $1 AND tg.status = 'pending'
       ORDER BY tg.created_at DESC LIMIT 1`,
      [userId]
    );
    if (pending[0]) {
      const g = pending[0];
      return res.json({
        success: true, hasGrant: true, grantType: 'pending',
        grantId:     g.id,
        websiteId:   g.w_id   || null,
        websiteName: g.website_name || null,
        expiresAt:   g.expires_at,
        accessToken: g.access_token,
      });
    }

    // Completed grant where website still has display data
    const { rows: completed } = await query(
      `SELECT tg.*, w.website_name, w.website_link, w.id AS w_id,
              w.granted_traffic_display, w.granted_views_display, w.granted_tier_display
       FROM traffic_grants tg
       LEFT JOIN websites w ON w.id = tg.website_id
       WHERE tg.user_id = $1 AND tg.status = 'completed'
         AND w.granted_traffic_display IS NOT NULL
       ORDER BY tg.completed_at DESC LIMIT 1`,
      [userId]
    );
    if (completed[0]) {
      const g = completed[0];
      return res.json({
        success: true, hasGrant: true, grantType: 'active_window',
        grantId:      g.id,
        websiteId:    g.w_id   || null,
        websiteName:  g.website_name || null,
        grantedTraffic: g.granted_traffic,
        grantedViews:   g.granted_views,
        trafficTier:    g.granted_tier_display || null,
      });
    }

    res.json({ success: true, hasGrant: false });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:userId/content  — all content created by a user
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserContent = async (req, res) => {
  try {
    const { userId } = req.params;
    const [websites, adSpaces, ads] = await Promise.all([
      Website.findByOwner(userId),
      AdCategory.findByOwner(userId),
      ImportAd.findByUser(userId),
    ]);
    res.json({ success: true, websites, adSpaces, ads });
  } catch (err) {
    console.error('getUserContent error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:userId/websites/:websiteId
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteWebsite = async (req, res) => {
  try {
    const { websiteId } = req.params;
    await query(`DELETE FROM ad_categories WHERE website_id = $1`, [websiteId]);
    await Website.delete(websiteId);
    res.json({ success: true, message: 'Website and its ad spaces deleted.' });
  } catch (err) {
    console.error('deleteWebsite error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:userId/ad-spaces/:spaceId
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteAdSpace = async (req, res) => {
  try {
    await AdCategory.delete(req.params.spaceId);
    res.json({ success: true, message: 'Ad space deleted.' });
  } catch (err) {
    console.error('deleteAdSpace error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:userId/ads/:adId
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteAd = async (req, res) => {
  try {
    await ImportAd.delete(req.params.adId);
    res.json({ success: true, message: 'Ad deleted.' });
  } catch (err) {
    console.error('deleteAd error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
