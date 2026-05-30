// AdDisplayController.js
const AdCategory = require('../models/CreateCategoryModel');
const Website = require('../models/CreateWebsiteModel');
const ImportAd = require('../../AdOwner/models/WebAdvertiseModel');
const PaymentTracker = require('../../AdOwner/models/PaymentTracker');

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

async function isAllowedDomain(categoryId, reqHeaders) {
  const referer = reqHeaders.referer || reqHeaders.origin || '';

  // No referer at all = block. We know the registered domain, no reason to be lenient.
  if (!referer) return false;

  const category = await AdCategory.findById(categoryId).populate('websiteId').lean();
  const registeredLink = category?.websiteId?.websiteLink;
  if (!registeredLink) return false;

  const registered = extractDomain(registeredLink);
  const incoming   = extractDomain(referer);

  return !!(registered && incoming && registered === incoming);
}

exports.displayAd = async (req, res) => {
  try {
    // CORS is handled by server-level middleware in server.js
    
    const { categoryId } = req.query;
    
    const adCategory = await AdCategory.findById(categoryId);
    if (!adCategory) {
      return res.json({ html: '' });
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
      return res.json({ html: '' });
    }

    const adsToShow = ads.slice(0, adCategory.userCount || ads.length);

    const adsHtml = adsToShow
      .map((ad) => {
        if (!ad) return '';

        try {
          const imageUrl = ad.imageUrl || 'https://via.placeholder.com/1200x630/667eea/ffffff?text=Ad+Image';
          const targetUrl = ad.businessLink.startsWith('http') ? 
            ad.businessLink : `https://${ad.businessLink}`;
          
          return `
            <div class="sp-item" 
                  data-ad-id="${ad._id}"
                  data-category-id="${categoryId}"
                  data-website-id="${adCategory.websiteId}">
              <a href="${targetUrl}" 
                  class="sp-link" 
                  target="_blank" 
                  rel="noopener"
                  data-tracking="true">
                <div class="sp-content">
                    <img class="sp-image" 
                         src="${imageUrl}" 
                         alt="${ad.businessName}" 
                         loading="lazy">
                  <div class="sp-text-content">
                    <h3 class="sp-business-name">${ad.businessName}</h3>
                    <p class="sp-description">${ad.adDescription}</p>
                    <button class="sp-cta" type="button">
                      Visit Website
                    </button>
                  </div>
                </div>
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
    
    const finalHtml = `<div class="sp-container">${adsHtml}</div>`;
    return res.json({ html: finalHtml });
  } catch (error) {
    console.error('Error displaying ad:', error);
    return res.json({ html: '' });
  }
};

exports.searchAd = async (req, res) => {
  try {
    // CORS is handled by server-level middleware in server.js
    
    //const { categoryId } = req.query;
    const { categoryId,searchTerm } = req.query;
    //const { categoryId,searchTerm } = req.params;
  
  // Escape any special characters (if needed)
  let searchEscape = searchTerm.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  // Create the regex pattern
  let searchRegex = new RegExp("([\\s\\S]*?)"+searchEscape.split(" ").join("([\\s\\S]*?)")+"([\\s\\S]*?)");

    const adCategory = await AdCategory.findById(categoryId);
    if (!adCategory) {
      return res.json({ message: "Can't Find AdCategory "+categoryId });
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
      'confirmed': true,
    $or: [
    {businessName: searchRegex},
    {businessLink: searchRegex},
    {adDescription: searchRegex}
    ]
    });
    if (!ads || ads.length === 0) {
      return res.json({message:"No Ads Found"});
    }

    const adsToShow = ads.slice(0, adCategory.userCount || ads.length);

    const adsJSON = adsToShow
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
          
          // Generate description from available data
          const description = ad.adDescription || 
                            `Visit ${ad.businessName} for great products and services.`;
          
          // Truncate description based on container size - more aggressive for small spaces
          const shortDescription = description.length > 80 ? 
            description.substring(0, 80) + '...' : description;

          // Add data attributes for tracking with new design
      //return `{"ad_id":"${ad._id}","category_id":"${categoryId}","website_id":"${adCategory.websiteId}","link":"${targetUrl}","cover":"${imageUrl}","business_name":"${ad.businessName}","description":"${shortDescription}"}`;
      /*return {"ad_id":ad._id,
        "category_id":categoryId,
        "website_id":adCategory.websiteId,
        "link":targetUrl,
                "cover":imageUrl,
        "business_name":ad.businessName,
        "description":shortDescription
      };*/
      return {
        "title":ad.businessName,
        "link":targetUrl,
        "description":shortDescription,
                "image":imageUrl,
      };
        } catch (error) {
          console.error('Error generating ad JSON:', error);
          return {"message":`Error generating ad JSON: ${error}`};
        }
      })
      //.filter(html => html)
      //.join('');
  console.log(adsJSON);
  console.log("AdsJSON LEN? ",adsJSON.length);
    //const finalJSON = adsJSON[0];
  const finalJSON = adsJSON.length ? adsJSON[0] : { message: 'No matching ads found' };
    //return res.json({link: finalJSON[0].link,cover: finalJSON[0].cover,type:"ad"});
    return res.json(finalJSON);
  } catch (error) {
    console.error('Error displaying ad:', error);
    return res.json({ message: "ERROR CAUGHT" });
  }
};

function getNoAdsHtml() {
  return `
    <div class="yepper-ad-container">
      <div class="yepper-ad-empty backdrop-blur-md bg-gradient-to-b from-gray-800/30 to-gray-900/10 rounded-xl overflow-hidden border border-gray-200/20 transition-all duration-300">
        <div class="yepper-ad-empty-title font-bold tracking-wide">Available Advertising Space</div>
        <a href="https://yepper.cc/select" class="yepper-ad-empty-link group relative overflow-hidden transition-all duration-300">
          <div class="absolute inset-0 bg-gray-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <span class="relative z-10 uppercase tracking-wider">Advertise Here</span>
        </a>
      </div>
    </div>
  `;
}

exports.incrementView = async (req, res) => {
  try {
    const { adId } = req.params;
    const { cid } = req.query;

    if (cid) {
      const allowed = await isAllowedDomain(cid, req.headers);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Domain not authorised' });
      }
    }

    // Use a transaction to ensure both updates succeed or fail together
    const session = await ImportAd.startSession();
    console.log(session);
    await session.withTransaction(async () => {
      // Increment views on the ad
      const updatedAd = await ImportAd.findByIdAndUpdate(
        adId, 
        { $inc: { views: 1 } },
        { new: true, select: 'views userId categoryId', session }
      );

      if (!updatedAd) {
        throw new Error('Ad not found');
      }

      // Update the payment tracker's view count
    /*
    const updatedTracker = await PaymentTracker.findOneAndUpdate(
        { adId },
        { $inc: { currentViews: 1 } },
        { new: true, session }
      );
    */
    const updatedTracker = await PaymentTracker.findOneAndUpdate(
      { adId },
      {
      $inc: { currentViews: 1 },
      $setOnInsert: {
        userId: updatedAd.userId,
        categoryId: updatedAd.categoryId,
        paymentDate: new Date(),
        amount: 0,
        viewsRequired: 0,
      }
      },
      { new: true, upsert: true }
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
    const { cid } = req.query;

    if (cid) {
      const allowed = await isAllowedDomain(cid, req.headers);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Domain not authorised' });
      }
    }

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