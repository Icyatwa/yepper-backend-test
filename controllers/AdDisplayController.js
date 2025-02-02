// AdDisplayController.js
const AdCategory = require('../models/AdCategoryModel');
const ImportAd = require('../models/ImportAdModel');
const PaymentTracker = require('../models/PaymentTracker');

exports.displayAd = async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { categoryId, callback } = req.query;
    
    const adCategory = await AdCategory.findById(categoryId);
    if (!adCategory) {
      return sendNoAdsResponse(res, callback);
    }

    // Base styles that will be injected with each ad
    const styles = `
      .yepper-ad-wrapper {
        width: 100%;
        max-width: 300px;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, sans-serif;
      }

      .yepper-ad-container {
        width: 100%;
      }

      .yepper-ad-item {
        width: 100%;
        padding: 12px;
        transition: all 0.3s ease;
      }

      .yepper-ad-link {
        text-decoration: none;
        color: inherit;
        display: block;
      }

      .yepper-ad-image-wrapper {
        width: 100%;
        position: relative;
        padding-top: 56.25%;
        overflow: hidden;
        border-radius: 6px;
        background: #f8f8f8;
      }

      .yepper-ad-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .yepper-ad-link:hover .yepper-ad-image {
        transform: scale(1.05);
      }

      .yepper-ad-text {
        margin-top: 10px;
        font-size: 14px;
        color: #333;
        line-height: 1.4;
        text-align: left;
        font-weight: 500;
      }

      .yepper-ad-empty {
        padding: 20px;
        text-align: center;
      }

      .yepper-ad-empty-title {
        font-size: 16px;
        font-weight: 600;
        color: #333;
        margin-bottom: 8px;
      }

      .yepper-ad-empty-text {
        font-size: 14px;
        color: #666;
        margin-bottom: 15px;
      }

      .yepper-ad-empty-link {
        display: inline-block;
        padding: 8px 16px;
        background: #007bff;
        color: #fff;
        border-radius: 4px;
        text-decoration: none;
        font-size: 14px;
        transition: background 0.3s ease;
      }

      .yepper-ad-empty-link:hover {
        background: #0056b3;
        text-decoration: none;
      }
    `;

    const styleTag = `<style>${styles}</style>`;

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
      return sendNoAdsResponse(res, callback);
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

          if (!websiteSelection) return '';

          const imageUrl = ad.imageUrl || 'https://via.placeholder.com/600x300';
          const targetUrl = ad.businessLink.startsWith('http') ? 
            ad.businessLink : `https://${ad.businessLink}`;

          return `
            <div class="yepper-ad-item" data-ad-id="${ad._id}">
              <a href="${targetUrl}" class="yepper-ad-link" target="_blank" rel="noopener">
                <div class="yepper-ad-image-wrapper">
                  <img class="yepper-ad-image" src="${imageUrl}" alt="${ad.businessName}" loading="lazy">
                </div>
                <p class="yepper-ad-text">${ad.businessName}</p>
              </a>
            </div>
          `;
        } catch (err) {
          console.error('[AdDisplay] Error generating HTML for ad:', ad._id, err);
          return '';
        }
      })
      .filter(html => html)
      .join('');

    if (!adsHtml) {
      return sendNoAdsResponse(res, callback);
    }

    const finalHtml = `${styleTag}<div class="yepper-ad-container">${adsHtml}</div>`;

    if (callback) {
      res.set('Content-Type', 'application/javascript');
      const response = `${callback}(${JSON.stringify({ html: finalHtml })})`;
      return res.send(response);
    }

    return res.send(finalHtml);

  } catch (error) {
    console.error('[AdDisplay] Critical error:', error);
    return sendNoAdsResponse(res, callback);
  }
};

function sendNoAdsResponse(res, callback) {
  const noAdsHtml = `
    <div class="yepper-ad-container">
      <div class="yepper-ad-empty">
        <div class="yepper-ad-empty-title">Available Advertising Space</div>
        <div class="yepper-ad-empty-text">Premium spot for your business advertisement</div>
        <a href="http://localhost:3000/select" class="yepper-ad-empty-link">Advertise Here</a>
      </div>
    </div>
  `;

  if (callback) {
    res.set('Content-Type', 'application/javascript');
    const response = `${callback}(${JSON.stringify({ html: noAdsHtml })})`;
    return res.send(response);
  }

  return res.send(noAdsHtml);
}

exports.incrementView = async (req, res) => {
  try {
    const { adId } = req.params;
    
    if (!adId) {
      return res.status(400).json({ error: 'Ad ID is required' });
    }

    // Increment views on the ad
    const updatedAd = await ImportAd.findByIdAndUpdate(
      adId, 
      { $inc: { views: 1 } },
      { new: true, select: 'views' }
    )

    // Update the payment tracker's view count
    await PaymentTracker.updateOne(
      { adId },
      { $inc: { currentViews: 1 } }
    )

    if (!updatedAd) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    return res.status(200).json({ views: updatedAd.views });

  } catch (error) {
    return res.status(500).json({ error: 'Failed to increment view count' });
  }
};

exports.incrementClick = async (req, res) => {
  try {
    const { adId } = req.params;
    
    if (!adId) {
      return res.status(400).json({ error: 'Ad ID is required' });
    }

    const updatedAd = await ImportAd.findByIdAndUpdate(
      adId, 
      { $inc: { clicks: 1 } },
      { new: true, select: 'clicks' }
    );

    if (!updatedAd) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    return res.status(200).json({ clicks: updatedAd.clicks });
  } catch (error) {
    console.error('Error recording click:', error);
    return res.status(500).json({ error: 'Failed to record click' });
  }
};