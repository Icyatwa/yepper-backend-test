// admin/controllers/adminController.js  — PostgreSQL version
const crypto    = require('crypto');
const { query } = require('../config/db');
const User        = require('../models/User');
const Website     = require('../AdPromoter/models/CreateWebsiteModel');
const TrafficGrant = require('../models/TrafficGrantModel');
const AdCategory  = require('../AdPromoter/models/CreateCategoryModel');
const ImportAd    = require('../AdOwner/models/WebAdvertiseModel');
const { Resend }  = require('resend');

const resend       = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://yeffddfdper.vercel.app';

// ── helpers ───────────────────────────────────────────────────────────────────

const generateAccessToken = () => crypto.randomBytes(32).toString('hex');

const sendGrantEmail = async (user, grant, website) => {
  const link        = `${FRONTEND_URL}/traffic-grant?token=${grant.access_token}`;
  const websiteName = website ? website.website_name : 'your website';
  try {
    await resend.emails.send({
      from: 'Yepper <noreply@yepper.cc>',
      to: user.email,
      subject: `🎁 You've been granted a special analytics boost for ${websiteName}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;"><tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,0.08);overflow:hidden;">
              <tr><td style="background:#000;padding:28px 40px;"><h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Yepper</h1></td></tr>
              <tr><td style="padding:40px;">
                <p style="color:#333;font-size:17px;margin:0 0 8px 0;">Hi <strong>${user.name}</strong>,</p>
                <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                  Great news! You've been selected to customize your analytics data for
                  <strong>${websiteName}</strong>. Use the button below to set your traffic and views numbers.
                </p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td align="center" style="padding:10px 0 32px 0;">
                    <a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:16px 36px;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">
                      Set My Analytics Numbers →
                    </a>
                  </td></tr>
                </table>
                <p style="color:#999;font-size:13px;line-height:1.5;margin:0;">
                  This link is personal to your account and expires in 7 days.
                </p>
              </td></tr>
              <tr><td style="background:#fafafa;border-top:1px solid #eee;padding:20px 40px;">
                <p style="color:#bbb;font-size:12px;margin:0;text-align:center;">
                  © ${new Date().getFullYear()} Yepper · <a href="${FRONTEND_URL}/privacy-policy" style="color:#bbb;">Privacy Policy</a>
                </p>
              </td></tr>
            </table>
          </td></tr></table>
        </body></html>`,
    });
    return true;
  } catch (err) {
    console.error('Failed to send grant email:', err);
    return false;
  }
};

// Normalise a user row for the frontend (adds _id alias, camelCase booleans)
function safeUser(u) {
  if (!u) return null;
  const out = { ...u, _id: u.id, isVerified: u.is_verified, googleId: u.google_id };
  delete out.password; delete out.gsc_access_token; delete out.gsc_refresh_token;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users
// users.id          → UUID
// websites.owner_id → TEXT  (stored as the user UUID string)
// traffic_grants.user_id → UUID
// ─────────────────────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lim    = parseInt(limit);

    // Build optional WHERE
    const params = [];
    let where    = '';
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE name ILIKE $1 OR email ILIKE $1`;
    }

    const countRes = await query(`SELECT COUNT(*) FROM users ${where}`, params);
    const total    = parseInt(countRes.rows[0].count, 10);

    // Paginated users (no password / tokens)
    const usersRes = await query(
      `SELECT id, name, email, avatar, is_verified, google_id, created_at, updated_at
       FROM users ${where}
       ORDER BY created_at DESC
       OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
      [...params, offset, lim]
    );
    const users = usersRes.rows;

    if (users.length === 0) {
      return res.json({ success: true, users: [], total, page: parseInt(page), limit: lim });
    }

    // UUID array for grant join; TEXT array for website join (owner_id is TEXT)
    const uuidIds = users.map(u => u.id);            // UUID[]
    const textIds = users.map(u => String(u.id));    // TEXT[]

    // Website counts — owner_id is TEXT so cast our UUIDs to text for the ANY()
    const wcRes = await query(
      `SELECT owner_id, COUNT(*) AS cnt
       FROM websites
       WHERE owner_id = ANY($1::text[])
       GROUP BY owner_id`,
      [textIds]
    );
    const countMap = {};
    for (const r of wcRes.rows) countMap[r.owner_id] = parseInt(r.cnt, 10);

    // Latest grant status per user — user_id is UUID
    const grantRes = await query(
      `SELECT DISTINCT ON (user_id) user_id, status
       FROM traffic_grants
       WHERE user_id = ANY($1::uuid[]) AND status IN ('pending','completed')
       ORDER BY user_id, created_at DESC`,
      [uuidIds]
    );
    const grantMap = {};
    for (const r of grantRes.rows) grantMap[String(r.user_id)] = r.status;

    const enriched = users.map(u => ({
      ...safeUser(u),
      websiteCount: countMap[String(u.id)] || 0,
      grantStatus:  grantMap[String(u.id)] || null,
    }));

    res.json({ success: true, users: enriched, total, page: parseInt(page), limit: lim });
  } catch (err) {
    console.error('getUsers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:userId
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // websites.owner_id is TEXT
    const websites = await Website.findByOwner(String(userId));

    // traffic_grants.user_id is UUID
    const grants = await TrafficGrant.findByUser(userId);

    const websiteMap = {};
    for (const w of websites) websiteMap[String(w.id)] = w;

    const safeWebsites = websites.map(w => ({
      ...w, _id: w.id,
      websiteName: w.website_name, websiteLink: w.website_link,
      monthlyTraffic: w.monthly_traffic, trafficTier: w.traffic_tier,
    }));

    const safeGrants = grants.map(g => ({
      ...g, _id: g.id,
      grantedTraffic: g.granted_traffic, grantedViews: g.granted_views,
      grantedBy: g.granted_by, expiresAt: g.expires_at,
      websiteId: g.website_id ? {
        _id: g.website_id,
        websiteName: websiteMap[String(g.website_id)]?.website_name || null,
        websiteLink: websiteMap[String(g.website_id)]?.website_link || null,
      } : null,
    }));

    res.json({ success: true, user: safeUser(user), websites: safeWebsites, grants: safeGrants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/grants
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

    // Revoke existing pending grants for this user+website combo
    // user_id is UUID, website_id is UUID (nullable)
    await query(
      `UPDATE traffic_grants SET status = 'revoked'
       WHERE user_id = $1::uuid
         AND website_id IS NOT DISTINCT FROM $2::uuid
         AND status = 'pending'`,
      [userId, websiteId || null]
    );

    const accessToken = generateAccessToken();
    const expiresAt   = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const grant = await TrafficGrant.create({
      userId, websiteId: websiteId || null,
      accessToken, expiresAt,
      grantedBy: req.admin.username,
      notes: notes || '',
    });

    const emailOk = await sendGrantEmail(user, grant, website);
    if (emailOk) {
      await query(
        `UPDATE traffic_grants SET email_sent = TRUE, email_sent_at = NOW() WHERE id = $1`,
        [grant.id]
      );
    }

    res.json({ success: true, grant, emailSent: emailOk });
  } catch (err) {
    console.error('createGrant error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/grants
// ─────────────────────────────────────────────────────────────────────────────
exports.getGrants = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const lim    = parseInt(limit);

    const params = [];
    let where    = '';
    if (status) { params.push(status); where = `WHERE tg.status = $1`; }

    const countRes = await query(`SELECT COUNT(*) FROM traffic_grants tg ${where}`, params);
    const total    = parseInt(countRes.rows[0].count, 10);

    const { rows: grants } = await query(
      `SELECT tg.*,
              u.name  AS user_name,  u.email AS user_email,
              w.website_name, w.website_link
       FROM traffic_grants tg
       LEFT JOIN users    u ON u.id    = tg.user_id
       LEFT JOIN websites w ON w.id   = tg.website_id
       ${where}
       ORDER BY tg.created_at DESC
       OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
      [...params, offset, lim]
    );

    const shaped = grants.map(g => ({
      ...g, _id: g.id,
      grantedTraffic: g.granted_traffic, grantedViews: g.granted_views,
      grantedBy: g.granted_by, expiresAt: g.expires_at,
      userId:    g.user_id    ? { _id: g.user_id,    name: g.user_name,    email: g.user_email }       : null,
      websiteId: g.website_id ? { _id: g.website_id, websiteName: g.website_name, websiteLink: g.website_link } : null,
    }));

    res.json({ success: true, grants: shaped, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/grants/:grantId  — revoke
// ─────────────────────────────────────────────────────────────────────────────
exports.revokeGrant = async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE traffic_grants SET status = 'revoked', updated_at = NOW()
       WHERE id = $1::uuid RETURNING *`,
      [req.params.grantId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Grant not found' });
    res.json({ success: true, grant: rows[0] });
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
      await query(
        `UPDATE traffic_grants SET email_sent = TRUE, email_sent_at = NOW() WHERE id = $1`,
        [grant.id]
      );
    }
    res.json({ success: true, emailSent: emailOk });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats
// ─────────────────────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [a, b, c, d, e] = await Promise.all([
      query(`SELECT COUNT(*) FROM users`),
      query(`SELECT COUNT(*) FROM websites`),
      query(`SELECT COUNT(*) FROM traffic_grants WHERE status = 'pending'`),
      query(`SELECT COUNT(*) FROM traffic_grants WHERE status = 'completed'`),
      query(`SELECT COUNT(*) FROM users WHERE created_at >= $1`, [since7d]),
    ]);
    res.json({ success: true, stats: {
      totalUsers:      parseInt(a.rows[0].count, 10),
      totalWebsites:   parseInt(b.rows[0].count, 10),
      pendingGrants:   parseInt(c.rows[0].count, 10),
      completedGrants: parseInt(d.rows[0].count, 10),
      newUsers7d:      parseInt(e.rows[0].count, 10),
    }});
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
              u.name AS user_name, u.email AS user_email,
              w.website_name, w.website_link,
              w.monthly_traffic, w.traffic_tier,
              w.granted_traffic_display, w.granted_views_display, w.granted_tier_display
       FROM traffic_grants tg
       LEFT JOIN users    u ON u.id  = tg.user_id
       LEFT JOIN websites w ON w.id  = tg.website_id
       WHERE tg.access_token = $1`,
      [token]
    );

    const g = rows[0];
    if (!g) return res.status(404).json({ success: false, message: 'Invalid or expired link' });
    if (g.status === 'revoked')   return res.status(403).json({ success: false, message: 'This link has been revoked' });
    if (g.status === 'completed') return res.json({ success: true, alreadyUsed: true,  grant: shapeGrant(g) });
    if (new Date() > new Date(g.expires_at)) {
      await query(`UPDATE traffic_grants SET status='expired' WHERE id=$1`, [g.id]);
      return res.status(410).json({ success: false, message: 'This link has expired' });
    }
    res.json({ success: true, alreadyUsed: false, grant: shapeGrant(g) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

function shapeGrant(g) {
  return {
    ...g, _id: g.id,
    accessToken: g.access_token, expiresAt: g.expires_at,
    grantedTraffic: g.granted_traffic, grantedViews: g.granted_views,
    userId:    g.user_id    ? { _id: g.user_id,    name: g.user_name, email: g.user_email } : null,
    websiteId: g.website_id ? {
      _id: g.website_id, websiteName: g.website_name, websiteLink: g.website_link,
      monthlyTraffic: g.monthly_traffic, trafficTier: g.traffic_tier,
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
      await query(`UPDATE traffic_grants SET status='expired' WHERE id=$1`, [grant.id]);
      return res.status(410).json({ success: false, message: 'Link has expired' });
    }

    const trafficNum = Math.max(0, parseInt(traffic) || 0);
    const viewsNum   = Math.max(0, parseInt(views)   || 0);
    const displayNum = Math.max(trafficNum, viewsNum);

    // website_id is UUID; owner_id in websites is TEXT
    let websiteId = grant.website_id;
    if (!websiteId) {
      const sites = await Website.findByOwner(String(grant.user_id));
      if (!sites || sites.length === 0)
        return res.status(400).json({ success: false, message: 'No website found for your account' });
      websiteId = sites[0].id;
    }

    let grantedTier = 'unverified';
    if      (displayNum >= 200001) grantedTier = 'elite';
    else if (displayNum >= 50001)  grantedTier = 'premium';
    else if (displayNum >= 10001)  grantedTier = 'standard';
    else if (displayNum >= 2001)   grantedTier = 'basic';
    else if (displayNum >= 500)    grantedTier = 'starter';

    await query(
      `UPDATE websites SET
         traffic_tier = $1, grant_window_expires_at = NULL,
         granted_traffic_display = $2, granted_views_display = $3, granted_tier_display = $4
       WHERE id = $5::uuid`,
      [grantedTier, trafficNum, viewsNum, grantedTier, websiteId]
    );

    // Reprice unpaid ad spaces (selected_ads is UUID[], empty = no bookings)
    const { rows: unpaid } = await query(
      `SELECT * FROM ad_categories
       WHERE website_id = $1::uuid AND (selected_ads IS NULL OR array_length(selected_ads,1) IS NULL)`,
      [websiteId]
    );
    const tierPrices   = TIER_PRICES[grantedTier] || TIER_PRICES['unverified'];
    let spacesRepriced = 0;
    for (const s of unpaid) {
      const canonical = SPACE_TYPE_MAP[s.space_type] || s.space_type;
      const newPrice  = tierPrices[canonical];
      if (newPrice !== undefined && parseFloat(newPrice) !== parseFloat(s.price)) {
        await query(`UPDATE ad_categories SET price=$1, tier=$2 WHERE id=$3`, [newPrice, grantedTier, s.id]);
        spacesRepriced++;
      }
    }

    await query(
      `UPDATE traffic_grants SET
         granted_traffic=$1, granted_views=$2, status='completed',
         token_used=TRUE, token_used_at=NOW(), completed_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [trafficNum, viewsNum, grant.id]
    );

    res.json({ success: true, message: 'Analytics updated successfully', grantedTraffic: trafficNum, grantedViews: viewsNum, trafficTier: grantedTier, spacesRepriced });
  } catch (err) {
    console.error('applyGrant error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/admin/user-grant-status  (requires user JWT)
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserGrantStatus = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;

    const { rows: pending } = await query(
      `SELECT tg.*, w.website_name, w.id AS w_id
       FROM traffic_grants tg
       LEFT JOIN websites w ON w.id = tg.website_id
       WHERE tg.user_id = $1::uuid AND tg.status = 'pending'
       ORDER BY tg.created_at DESC LIMIT 1`,
      [userId]
    );
    if (pending[0]) {
      const g = pending[0];
      return res.json({ success: true, hasGrant: true, grantType: 'pending',
        grantId: g.id, websiteId: g.w_id || null, websiteName: g.website_name || null,
        expiresAt: g.expires_at, accessToken: g.access_token });
    }

    const { rows: completed } = await query(
      `SELECT tg.*, w.website_name, w.id AS w_id,
              w.granted_traffic_display, w.granted_views_display, w.granted_tier_display
       FROM traffic_grants tg
       LEFT JOIN websites w ON w.id = tg.website_id
       WHERE tg.user_id = $1::uuid AND tg.status = 'completed'
         AND w.granted_traffic_display IS NOT NULL
       ORDER BY tg.completed_at DESC LIMIT 1`,
      [userId]
    );
    if (completed[0]) {
      const g = completed[0];
      return res.json({ success: true, hasGrant: true, grantType: 'active_window',
        grantId: g.id, websiteId: g.w_id || null, websiteName: g.website_name || null,
        grantedTraffic: g.granted_traffic, grantedViews: g.granted_views,
        trafficTier: g.granted_tier_display || null });
    }

    res.json({ success: true, hasGrant: false });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:userId/content
// websites.owner_id   → TEXT
// ad_categories.owner_id → TEXT
// import_ads.user_id  → TEXT
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserContent = async (req, res) => {
  try {
    const { userId } = req.params;
    // All three tables store the owner as TEXT, so cast once
    const id = String(userId);
    const [websites, adSpaces, ads] = await Promise.all([
      Website.findByOwner(id),
      AdCategory.findByOwner(id),
      ImportAd.findByUser(id),
    ]);
    res.json({ success: true, websites, adSpaces, ads });
  } catch (err) {
    console.error('getUserContent error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:userId/websites/:websiteId
// Deletes ad_categories (CASCADE would handle it but let's be explicit) + website
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteWebsite = async (req, res) => {
  try {
    await query(`DELETE FROM ad_categories WHERE website_id = $1::uuid`, [req.params.websiteId]);
    await query(`DELETE FROM websites       WHERE id         = $1::uuid`, [req.params.websiteId]);
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
    await query(`DELETE FROM ad_categories WHERE id = $1::uuid`, [req.params.spaceId]);
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
    await query(`DELETE FROM import_ads WHERE id = $1::uuid`, [req.params.adId]);
    res.json({ success: true, message: 'Ad deleted.' });
  } catch (err) {
    console.error('deleteAd error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
