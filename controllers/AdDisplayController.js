// AdDisplayController.js
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');
const PaymentTracker = require('../models/PaymentTracker');

exports.displayAd = async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { categoryId } = req.query;
    
    const adCategory = await AdCategory.findById(categoryId);
    if (!adCategory) {
      return res.json({ html: getNoAdsHtml() });
    }
    
    const ads = await ImportAd.find({
      _id: { $in: adCategory.selectedAds },
      'websiteSelections': {
        $elemMatch: {
          websiteId: adCategory.websiteId,
          categories: categoryId,
          approved: true
        }
      },
      'confirmed': true
    });

    if (!ads || ads.length === 0) {
      return res.json({ html: getNoAdsHtml() });
    }

    const adsToShow = ads.slice(0, adCategory.userCount || ads.length);

    const adsHtml = adsToShow
      .map((ad) => {
        if (!ad) return '';

        try {
          const websiteSelection = ad.websiteSelections.find(
            sel => sel.websiteId.toString() === adCategory.websiteId.toString() &&
                  sel.approved
          );

          const imageUrl = ad.imageUrl || 'https://via.placeholder.com/600x300';
          const targetUrl = ad.businessLink.startsWith('http') ? 
            ad.businessLink : `https://${ad.businessLink}`;

          // Add data attributes for tracking
          return `
            <div class="yepper-ad-item" 
                  data-ad-id="${ad._id}"
                  data-category-id="${categoryId}"
                  data-website-id="${adCategory.websiteId}">
              <a href="${targetUrl}" 
                  class="yepper-ad-link" 
                  target="_blank" 
                  rel="noopener"
                  data-tracking="true">
                <div class="yepper-ad-image-wrapper">
                  <img class="yepper-ad-image" src="${imageUrl}" alt="${ad.businessName}" loading="lazy">
                </div>
                <p class="yepper-ad-text">${ad.businessName}</p>
              </a>
            </div>
          `;
        } catch (error) {
          console.error('Error generating ad HTML:', error);
          return '';
        }
      })
      .filter(html => html)
      .join('');

    const finalHtml = `<div class="yepper-ad-container">${adsHtml}</div>`;
    return res.json({ html: finalHtml });
  } catch (error) {
    console.error('Error displaying ad:', error);
    return res.json({ html: getNoAdsHtml() });
  }
};

function getNoAdsHtml() {
  return `
    <div class="yepper-ad-container">
      <div class="yepper-ad-empty">
        <div class="yepper-ad-empty-title">Available Advertising Space</div>
        <div class="yepper-ad-empty-text">Premium spot for your business advertisement</div>
        <a href="http://localhost:3000/select" class="yepper-ad-empty-link">Advertise Here</a>
      </div>
    </div>
  `;
}

exports.incrementView = async (req, res) => {
  try {
    const { adId } = req.params;

    // Use a transaction to ensure both updates succeed or fail together
    const session = await ImportAd.startSession();
    await session.withTransaction(async () => {
      // Increment views on the ad
      const updatedAd = await ImportAd.findByIdAndUpdate(
        adId, 
        { $inc: { views: 1 } },
        { new: true, select: 'views', session }
      );

      if (!updatedAd) {
        throw new Error('Ad not found');
      }

      // Update the payment tracker's view count
      const updatedTracker = await PaymentTracker.findOneAndUpdate(
        { adId },
        { $inc: { currentViews: 1 } },
        { new: true, session }
      );

      if (!updatedTracker) {
        throw new Error('Payment tracker not found');
      }
    });

    await session.endSession();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error incrementing view:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.incrementClick = async (req, res) => {
  try {
    const { adId } = req.params;

    const updatedAd = await ImportAd.findByIdAndUpdate(
      adId, 
      { $inc: { clicks: 1 } },
      { new: true, select: 'clicks' }
    );

    if (!updatedAd) {
      throw new Error('Ad not found');
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error incrementing click:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};