// AdCategoryController.js
const AdCategory = require('../models/AdCategoryModel');
const crypto = require('crypto');

const generateSecureScript = (categoryId) => {
  const key = Buffer.from(crypto.randomBytes(32)).toString('base64');
  
  const encode = (str, key) => {
    let encoded = '';
    for(let i = 0; i < str.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const strChar = str.charCodeAt(i);
      encoded += String.fromCharCode(strChar ^ keyChar);
    }
    return Buffer.from(encoded).toString('base64');
  };

  const coreScript = `
    const d=document,
          _i="${categoryId}",
          _b="https://yepper-backend-test.onrender.com/api",
          _t=5000;

    const _l=()=>{
      // Get the current script element using a more reliable method
      let currentScript = d.currentScript;
      if (!currentScript) {
        const scripts = d.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].textContent.includes('${categoryId}')) {
            currentScript = scripts[i];
            break;
          }
        }
      }
      
      if (!currentScript) {
        console.error('Could not find ad script element');
        return;
      }

      // Create and insert container
      const container = d.createElement('div');
      container.className = 'yepper-ad-wrapper';
      currentScript.parentNode.insertBefore(container, currentScript);

      const showEmptyState = () => {
        container.innerHTML = \`
          <div class="yepper-ad-empty">
            <div class="yepper-ad-empty-title">Available Space for Advertising</div>
            <div class="yepper-ad-empty-text">Premium spot for your business advertisement</div>
            <a href="https://payment-test-page.vercel.app/select" class="yepper-ad-empty-link">Advertise Here</a>
          </div>
        \`;
      };

      const l = d.createElement("script");
      const r = "y"+Math.random().toString(36).substr(2,9);
      
      window[r] = h => {
        if(!h || !h.html) {
          showEmptyState();
          return;
        }

        container.innerHTML = h.html;

        const items = [...container.getElementsByClassName("yepper-ad-item")];
        
        if(!items.length) {
          showEmptyState();
          return;
        }
        
        // Hide all items except first
        items.forEach((e, index) => {
          if(index !== 0) e.style.display = "none";
        });
        
        // Track views and handle clicks
        items.forEach(e => {
          const link = e.querySelector('.yepper-ad-link');
          if(!link) return;
          
          const i = e.dataset.adId;
          const viewTracker = () => {
            fetch(_b+"/ads/view/"+i, {
              method: 'POST',
              mode: 'cors',
              credentials: 'omit'
            }).catch(console.error);
          };
          
          if(e.style.display !== "none") {
            viewTracker();
          }
          
          link.onclick = ev => {
            ev.preventDefault();
            fetch(_b+"/ads/click/"+i, {
              method: 'POST',
              mode: 'cors',
              credentials: 'omit'
            })
            .then(() => window.open(link.href,'_blank'))
            .catch(() => window.open(link.href,'_blank'));
            return false;
          };
        });
        
        // Rotate ads if multiple
        if(items.length > 1) {
          let x = 0;
          setInterval(() => {
            items[x].style.display = "none";
            x = (x + 1) % items.length;
            items[x].style.display = "block";
            
            const link = items[x].querySelector('.yepper-ad-link');
            if(link) {
              const i = items[x].dataset.adId;
              fetch(_b+"/ads/view/"+i, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              }).catch(console.error);
            }
          }, _t);
        }
        
        delete window[r];
      };
      
      l.src = _b+"/ads/display?categoryId="+_i+"&callback="+r;
      l.onerror = () => {
        showEmptyState();
      };
      d.body.appendChild(l);
    };

    // Run the initialization immediately instead of waiting for DOMContentLoaded
    _l();
  `;

  const encoded = encode(coreScript, key);

  return {
    script: `
    (function(){
      const _k='${key}';
      const _d='${encoded}';
      
      const _dec=(str,key)=>{
        const decoded=atob(str);
        let result='';
        for(let i=0;i<decoded.length;i++){
          const keyChar=key.charCodeAt(i%key.length);
          const strChar=decoded.charCodeAt(i);
          result+=String.fromCharCode(strChar^keyChar);
        }
        return result;
      };

      try {
        const script=_dec(_d,_k);
        const f=new Function(script);
        f();
      } catch(e) {
        console.error('Ad script initialization error:',e);
        if(document.currentScript) {
          const container = document.createElement('div');
          container.className = 'yepper-ad-wrapper';
          document.currentScript.parentNode.insertBefore(container, document.currentScript);
          container.innerHTML = \`
            <div class="yepper-ad-empty">
              <div class="yepper-ad-empty-title">Advertisement</div>
              <div class="yepper-ad-empty-text">Unable to load advertisement</div>
            </div>
          \`;
        }
      }
    })();`,
    key
  };
};
 
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
        <a href="https://payment-test-page.vercel.app/select" class="yepper-ad-empty-link">Advertise Here</a>
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