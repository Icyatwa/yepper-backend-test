// AdDisplayController.js — PostgreSQL version
const { query } = require('../../config/db');
const AdCategory = require('../models/CreateCategoryModel');
const Website    = require('../models/CreateWebsiteModel');
const ImportAd   = require('../../AdOwner/models/WebAdvertiseModel');

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

async function isAllowedDomain(categoryId, reqHeaders) {
  const referer = reqHeaders.referer || reqHeaders.origin || '';
  if (!referer) return false;
  const category = await AdCategory.findById(categoryId);
  const website  = category ? await Website.findById(category.website_id) : null;
  const registeredLink = website?.website_link;
  if (!registeredLink) return false;
  return extractDomain(registeredLink) === extractDomain(referer);
}

exports.displayAd = async (req, res) => {
  try {
    const { categoryId } = req.query;
    if (!categoryId) return res.json({ html: '' });

    const adCategory = await AdCategory.findById(categoryId);
    if (!adCategory) return res.json({ html: '' });

    const selectedAds = Array.isArray(adCategory.selected_ads)
      ? adCategory.selected_ads
      : JSON.parse(adCategory.selected_ads || '[]');

    if (!selectedAds.length) return res.json({ html: '' });

    // Fetch active ads from JSONB
    const { rows: ads } = await query(
      `SELECT * FROM import_ads
       WHERE id = ANY($1::uuid[])
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(website_selections) sel
           WHERE sel->>'websiteId' = $2
             AND (sel->>'approved')::boolean = true
             AND sel->>'status' = 'active'
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(sel->'categories') cat_id
               WHERE cat_id = $3
             )
         )`,
      [selectedAds, adCategory.website_id?.toString(), categoryId]
    );

    if (!ads.length) return res.json({ html: '' });

    const adsToShow = ads.slice(0, adCategory.user_count || ads.length);
    const adsHtml = adsToShow.map(ad => {
      try {
        const imageUrl = ad.image_url || 'https://via.placeholder.com/1200x630/667eea/ffffff?text=Ad+Image';
        const targetUrl = (ad.business_link || '').startsWith('http') ? ad.business_link : `https://${ad.business_link}`;
        return `
          <div class="sp-item" data-ad-id="${ad.id}" data-category-id="${categoryId}" data-website-id="${adCategory.website_id}">
            <a href="${targetUrl}" class="sp-link" target="_blank" rel="noopener" data-tracking="true">
              <div class="sp-content">
                <img class="sp-image" src="${imageUrl}" alt="${ad.business_name}" loading="lazy">
                <div class="sp-text-content">
                  <h3 class="sp-business-name">${ad.business_name}</h3>
                  <p class="sp-description">${ad.ad_description || ''}</p>
                  <button class="sp-cta" type="button">Visit Website</button>
                </div>
              </div>
            </a>
          </div>`;
      } catch (e) { return ''; }
    }).filter(Boolean).join('');

    return res.json({ html: `<div class="sp-container">${adsHtml}</div>` });
  } catch (error) {
    console.error('Error displaying ad:', error);
    return res.json({ html: '' });
  }
};

exports.searchAd = async (req, res) => {
  try {
    const { categoryId, searchTerm } = req.query;
    if (!categoryId) return res.json({ message: 'Missing categoryId' });

    const adCategory = await AdCategory.findById(categoryId);
    if (!adCategory) return res.json({ message: `Can't Find AdCategory ${categoryId}` });

    const selectedAds = Array.isArray(adCategory.selected_ads)
      ? adCategory.selected_ads
      : JSON.parse(adCategory.selected_ads || '[]');

    const term = `%${(searchTerm || '').toLowerCase()}%`;

    const { rows: ads } = await query(
      `SELECT * FROM import_ads
       WHERE id = ANY($1::uuid[])
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(website_selections) sel
           WHERE sel->>'websiteId' = $2
             AND (sel->>'approved')::boolean = true
             AND sel->>'status' = 'active'
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(sel->'categories') cat_id
               WHERE cat_id = $3
             )
         )
         AND (
           LOWER(business_name) LIKE $4
           OR LOWER(business_link) LIKE $4
           OR LOWER(ad_description) LIKE $4
         )`,
      [selectedAds, adCategory.website_id?.toString(), categoryId, term]
    );

    if (!ads.length) return res.json({ message: 'No Ads Found' });

    const ad = ads[0];
    const targetUrl = (ad.business_link || '').startsWith('http') ? ad.business_link : `https://${ad.business_link}`;
    const desc = (ad.ad_description || '');
    return res.json({
      title: ad.business_name,
      link: targetUrl,
      description: desc.length > 80 ? desc.substring(0, 80) + '...' : desc,
      image: ad.image_url || 'https://via.placeholder.com/600x300',
    });
  } catch (error) {
    console.error('Error in searchAd:', error);
    return res.json({ message: 'ERROR CAUGHT' });
  }
};

exports.incrementView = async (req, res) => {
  try {
    const { adId } = req.params;
    if (!adId || adId === 'undefined' || adId === 'null') {
      return res.status(400).json({ success: false, message: 'Invalid adId' });
    }
    await ImportAd.incrementViews(adId);
    // Upsert payment tracker via raw query
    await query(
      `INSERT INTO payment_trackers (ad_id, current_views)
       VALUES ($1, 1)
       ON CONFLICT (ad_id) DO UPDATE SET current_views = payment_trackers.current_views + 1`,
      [adId]
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error incrementing view:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.incrementClick = async (req, res) => {
  try {
    const { adId } = req.params;
    if (!adId || adId === 'undefined' || adId === 'null') {
      return res.status(400).json({ success: false, message: 'Invalid adId' });
    }
    await ImportAd.incrementClicks(adId);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error incrementing click:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
