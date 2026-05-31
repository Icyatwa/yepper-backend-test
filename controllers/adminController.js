// admin/controllers/adminController.js
const crypto = require('crypto');
const User = require('../models/User');
const Website = require('../AdPromoter/models/CreateWebsiteModel');
const PageView = require('../AdPromoter/models/WebsiteAnalyticsModel');
const TrafficGrant = require('../models/TrafficGrantModel');
const { Resend } = require('resend');
const AdCategory = require('../AdPromoter/models/CreateCategoryModel');

const resend = new Resend(process.env.RESEND_API_KEY);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://yepper.cc';

// ── helpers ──────────────────────────────────────────────────────────────────

const generateAccessToken = () => crypto.randomBytes(32).toString('hex');

const sendGrantEmail = async (user, grant, website) => {
  const link = `${FRONTEND_URL}/traffic-grant?token=${grant.accessToken}`;
  const websiteName = website ? website.websiteName : 'your website';

  try {
    await resend.emails.send({
      from: 'Yepper <noreply@yepper.cc>',
      to: user.email,
      subject: `🎁 You've been granted a special analytics boost for ${websiteName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,0.08);overflow:hidden;">
                <!-- Header bar -->
                <tr>
                  <td style="background:#000;padding:28px 40px;">
                    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Yepper</h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px;">
                    <p style="color:#333;font-size:17px;margin:0 0 8px 0;">Hi <strong>${user.name}</strong>,</p>
                    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                      Great news! You've been selected to customize your analytics data for
                      <strong>${websiteName}</strong>. Use the button below to set your traffic and views numbers —
                      they'll appear directly in your analytics dashboard.
                    </p>

                    <!-- CTA button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:10px 0 32px 0;">
                          <a href="${link}"
                             style="display:inline-block;background:#000;color:#fff;padding:16px 36px;
                                    text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;
                                    letter-spacing:0.2px;">
                            Set My Analytics Numbers →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- What happens block -->
                    <table width="100%" cellpadding="0" cellspacing="0"
                           style="background:#f8f8f8;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
                      <tr>
                        <td>
                          <p style="color:#333;font-size:14px;font-weight:600;margin:0 0 10px 0;">What happens next?</p>
                          <ul style="color:#555;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                            <li>Click the button above (or find it on your website dashboard)</li>
                            <li>Enter the traffic &amp; views numbers you want displayed</li>
                            <li>They'll update automatically in your analytics</li>
                            <li>No need to log in again — your account is already linked</li>
                          </ul>
                        </td>
                      </tr>
                    </table>

                    <p style="color:#999;font-size:13px;line-height:1.5;margin:0;">
                      This link is personal to your account and expires in 7 days.
                      If you didn't expect this email, you can safely ignore it.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#fafafa;border-top:1px solid #eee;padding:20px 40px;">
                    <p style="color:#bbb;font-size:12px;margin:0;text-align:center;">
                      © ${new Date().getFullYear()} Yepper · <a href="${FRONTEND_URL}/privacy-policy" style="color:#bbb;">Privacy Policy</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
    return true;
  } catch (err) {
    console.error('Failed to send grant email:', err);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users  — list all users with their websites
// ─────────────────────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = search
      ? { $or: [
          { name:  { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ]}
      : {};

    const [users, total] = await Promise.all([
      User.find(query).select('-password -gscAccessToken -gscRefreshToken')
           .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      User.countDocuments(query),
    ]);

    // Attach website count + active grants
    const userIds = users.map(u => u._id.toString());
    const [websiteCounts, grants] = await Promise.all([
      Website.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        { $group: { _id: '$ownerId', count: { $sum: 1 } } },
      ]),
      TrafficGrant.find({ userId: { $in: users.map(u => u._id) }, status: { $in: ['pending', 'completed'] } })
        .select('userId status').lean(),
    ]);

    const countMap  = Object.fromEntries(websiteCounts.map(x => [x._id, x.count]));
    const grantMap  = {};
    for (const g of grants) {
      grantMap[g.userId.toString()] = g.status;
    }

    const enriched = users.map(u => ({
      ...u,
      websiteCount: countMap[u._id.toString()] || 0,
      grantStatus: grantMap[u._id.toString()] || null,
    }));

    res.json({ success: true, users: enriched, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getUsers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:userId  — single user detail
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -gscAccessToken -gscRefreshToken').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [websites, grants] = await Promise.all([
      Website.find({ ownerId: req.params.userId }).lean(),
      TrafficGrant.find({ userId: req.params.userId }).sort({ createdAt: -1 }).lean(),
    ]);

    res.json({ success: true, user, websites, grants });
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
      website = await Website.findById(websiteId).lean();
      if (!website) return res.status(404).json({ success: false, message: 'Website not found' });
    }

    // Revoke any pending grant for same user+website combo
    await TrafficGrant.updateMany(
      { userId, websiteId: websiteId || null, status: 'pending' },
      { $set: { status: 'revoked' } }
    );

    const accessToken = generateAccessToken();
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const grant = await TrafficGrant.create({
      userId,
      websiteId: websiteId || null,
      accessToken,
      expiresAt,
      grantedBy: req.admin.username,
      notes: notes || '',
    });

    // Send email
    const emailOk = await sendGrantEmail(user, grant, website);
    if (emailOk) {
      grant.emailSent  = true;
      grant.emailSentAt = new Date();
      await grant.save();
    }

    res.json({ success: true, grant, emailSent: emailOk });
  } catch (err) {
    console.error('createGrant error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/grants  — list all grants
// ─────────────────────────────────────────────────────────────────────────────
exports.getGrants = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = status ? { status } : {};
    const skip   = (parseInt(page) - 1) * parseInt(limit);

    const [grants, total] = await Promise.all([
      TrafficGrant.find(filter)
        .populate('userId', 'name email')
        .populate('websiteId', 'websiteName websiteLink')
        .sort({ createdAt: -1 })
        .skip(skip).limit(parseInt(limit)).lean(),
      TrafficGrant.countDocuments(filter),
    ]);

    res.json({ success: true, grants, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/grants/:grantId  — revoke a grant
// ─────────────────────────────────────────────────────────────────────────────
exports.revokeGrant = async (req, res) => {
  try {
    const grant = await TrafficGrant.findByIdAndUpdate(
      req.params.grantId,
      { status: 'revoked' },
      { new: true }
    );
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

    const user    = await User.findById(grant.userId).lean();
    const website = grant.websiteId ? await Website.findById(grant.websiteId).lean() : null;

    const emailOk = await sendGrantEmail(user, grant, website);
    if (emailOk) {
      grant.emailSent   = true;
      grant.emailSentAt = new Date();
      await grant.save();
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
    const [totalUsers, totalWebsites, pendingGrants, completedGrants] = await Promise.all([
      User.countDocuments(),
      Website.countDocuments(),
      TrafficGrant.countDocuments({ status: 'pending' }),
      TrafficGrant.countDocuments({ status: 'completed' }),
    ]);

    // New users last 7 days
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsers7d = await User.countDocuments({ createdAt: { $gte: since7d } });

    res.json({ success: true, stats: { totalUsers, totalWebsites, pendingGrants, completedGrants, newUsers7d } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/admin/grant-check?token=XXX
// Called by the client to validate a token before showing the input form.
// Returns user+website info but NOT the token itself.
// ─────────────────────────────────────────────────────────────────────────────
exports.checkGrantToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const grant = await TrafficGrant.findOne({ accessToken: token })
      .populate('userId', 'name email _id')
      .populate('websiteId', 'websiteName websiteLink _id monthlyTraffic trafficTier')
      .lean();

    if (!grant) return res.status(404).json({ success: false, message: 'Invalid or expired link' });
    if (grant.status === 'revoked')  return res.status(403).json({ success: false, message: 'This link has been revoked' });
    if (grant.status === 'completed') return res.json({ success: true, alreadyUsed: true, grant });
    if (new Date() > new Date(grant.expiresAt)) {
      await TrafficGrant.findByIdAndUpdate(grant._id, { status: 'expired' });
      return res.status(410).json({ success: false, message: 'This link has expired' });
    }

    res.json({ success: true, alreadyUsed: false, grant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /api/admin/grant-apply
// The user submits their desired traffic/views numbers.
// We store them as display-only fields on the website document and tag
// any injected PageView records with isGranted=true so the real analytics
// pipeline is never polluted. Tier and unpaid ad spaces are updated to match.
// ─────────────────────────────────────────────────────────────────────────────

// Pricing table (mirrors PricingTiers.js on the frontend)
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

    const grant = await TrafficGrant.findOne({ accessToken: token });
    if (!grant) return res.status(404).json({ success: false, message: 'Invalid link' });
    if (grant.status !== 'pending') return res.status(400).json({ success: false, message: 'This grant is no longer active' });
    if (new Date() > new Date(grant.expiresAt)) {
      await TrafficGrant.findByIdAndUpdate(grant._id, { status: 'expired' });
      return res.status(410).json({ success: false, message: 'Link has expired' });
    }

    const trafficNum = Math.max(0, parseInt(traffic) || 0);
    const viewsNum   = Math.max(0, parseInt(views)   || 0);
    const displayNum = Math.max(trafficNum, viewsNum); // the number used for tier calculation

    // Resolve target website
    const WebsiteModel = require('../AdPromoter/models/CreateWebsiteModel');
    let websiteId = grant.websiteId?.toString();
    if (!websiteId) {
      const site = await WebsiteModel.findOne({ ownerId: grant.userId.toString() }).lean();
      if (!site) return res.status(400).json({ success: false, message: 'No website found for your account' });
      websiteId = site._id.toString();
    }

    // Determine tier from the stated traffic number
    let grantedTier = 'unverified';
    if (displayNum >= 200001)     grantedTier = 'elite';
    else if (displayNum >= 50001) grantedTier = 'premium';
    else if (displayNum >= 10001) grantedTier = 'standard';
    else if (displayNum >= 2001)  grantedTier = 'basic';
    else if (displayNum >= 500)   grantedTier = 'starter';

    // ── Update website: store display values + tier ────────────────────────
    // NOTE: real monthlyTraffic (from the script) is NOT touched.
    // The grant display stays until the system's own traffic counting
    // reaches/surpasses the tier the owner was granted (cleared in trackPageView).
    await WebsiteModel.findByIdAndUpdate(websiteId, {
      trafficTier:           grantedTier,
      grantWindowExpiresAt:  null,       // no time limit — cleared by real traffic
      grantedTrafficDisplay: trafficNum,
      grantedViewsDisplay:   viewsNum,
      grantedTierDisplay:    grantedTier,
    });

    // ── Reprice unpaid ad spaces to match new tier ─────────────────────────
    // Only reprice spaces that have no active/paid booking (i.e. selectedAds is empty)
    const unpaidSpaces = await AdCategory.find({
      websiteId,
      $or: [{ selectedAds: { $size: 0 } }, { selectedAds: { $exists: false } }],
    }).lean();

    const tierPrices = TIER_PRICES[grantedTier] || TIER_PRICES['unverified'];
    const repriceOps = [];
    for (const space of unpaidSpaces) {
      const canonicalType = SPACE_TYPE_MAP[space.spaceType] || space.spaceType;
      const newPrice = tierPrices[canonicalType];
      if (newPrice !== undefined && newPrice !== space.price) {
        repriceOps.push({
          updateOne: {
            filter: { _id: space._id },
            update: { $set: { price: newPrice, tier: grantedTier } },
          },
        });
      }
    }
    if (repriceOps.length > 0) await AdCategory.bulkWrite(repriceOps);

    // ── Mark grant as completed with window info ────────────────────────────
    grant.grantedTraffic      = trafficNum;
    grant.grantedViews        = viewsNum;
    grant.status              = 'completed';
    grant.tokenUsed           = true;
    grant.tokenUsedAt         = new Date();
    grant.completedAt         = new Date();
    await grant.save();

    res.json({
      success: true,
      message: 'Analytics updated successfully',
      grantedTraffic:      trafficNum,
      grantedViews:        viewsNum,
      trafficTier:         grantedTier,
      spacesRepriced:      repriceOps.length,
    });
  } catch (err) {
    console.error('applyGrant error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/admin/user-grant-status?userId=XXX
// Called by the WebsiteDetails dashboard to check if this user has a pending grant.
// Uses the user's JWT (passed via Authorization header — validated in route).
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserGrantStatus = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;

    // First check for a pending grant (not yet used)
    const pendingGrant = await TrafficGrant.findOne({ userId, status: 'pending' })
      .populate('websiteId', 'websiteName websiteLink _id')
      .lean();

    if (pendingGrant) {
      return res.json({
        success: true,
        hasGrant: true,
        grantType: 'pending',
        grantId:     pendingGrant._id,
        websiteId:   pendingGrant.websiteId?._id   || null,
        websiteName: pendingGrant.websiteId?.websiteName || null,
        expiresAt:   pendingGrant.expiresAt,
        accessToken: pendingGrant.accessToken,
      });
    }

    // Check for a completed grant that is still active.
    // A grant stays active until the website's own real traffic counting catches up
    // to the granted tier — at that point analyticsController clears the display fields.
    const completedGrant = await TrafficGrant.findOne({
      userId,
      status: 'completed',
    })
      .populate('websiteId', 'websiteName websiteLink _id grantedTrafficDisplay grantedViewsDisplay grantedTierDisplay')
      .sort({ completedAt: -1 })
      .lean();

    // Only show banner if the website still has grant data (not yet cleared by real traffic)
    if (completedGrant && completedGrant.websiteId?.grantedTrafficDisplay != null) {
      return res.json({
        success: true,
        hasGrant: true,
        grantType: 'active_window',
        grantId:     completedGrant._id,
        websiteId:   completedGrant.websiteId?._id   || null,
        websiteName: completedGrant.websiteId?.websiteName || null,
        grantedTraffic: completedGrant.grantedTraffic,
        grantedViews:   completedGrant.grantedViews,
        trafficTier:    completedGrant.websiteId?.grantedTierDisplay || null,
      });
    }

    res.json({ success: true, hasGrant: false });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
