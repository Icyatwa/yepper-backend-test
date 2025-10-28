// AdScriptController.js
const AdCategory = require('../models/CreateCategoryModel');

exports.serveAdScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const adCategory = await AdCategory.findById(scriptId)
      .populate('websiteId')
      .lean();
    
    if (!adCategory) {
      return res.status(404).send('Ad category not found');
    }

    const customization = adCategory.customization || {};
    
    const categoryPrice = adCategory.price;
    const defaultLanguage = adCategory.defaultLanguage || 'english';
    const websiteId = adCategory.websiteId._id;
    const websiteName = adCategory.websiteId.websiteName || 'This website';
    const categoryName = adCategory.categoryName || 'this space';
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const adScript = `
    (function() {
      const d = document,
        _i = "${scriptId}",
        _w = "${websiteId}",
        _wName = "${websiteName}",
        _cName = "${categoryName}",
        _b = "http://localhost:5000/api",
        _t = 5000,
        _p = ${categoryPrice},
        _l = "${defaultLanguage}";
    
      const styles = \`
        .yepper-ad-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          margin: 0;
          line-height: 1.4;
          background: none;
          container-type: inline-size;
          container-name: ad-wrapper;
        }

        .yepper-powered-by {
          text-align: center;
          padding: clamp(4px, 1.5cqw, 8px) clamp(6px, 2cqw, 12px);
          font-size: clamp(7px, 2cqw, 10px);
          color: rgba(0, 0, 0, 0.5);
          font-weight: 500;
          letter-spacing: 0.02em;
          margin-bottom: clamp(4px, 1.5cqw, 8px);
        }

        .yepper-powered-by-link {
          color: rgba(0, 0, 0, 0.6);
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s ease;
        }

        .yepper-powered-by-link:hover {
          color: rgba(0, 0, 0, 0.8);
        }

        @media (prefers-color-scheme: dark) {
          .yepper-powered-by {
            color: rgba(255, 255, 255, 0.5);
          }
          .yepper-powered-by-link {
            color: rgba(255, 255, 255, 0.6);
          }
          .yepper-powered-by-link:hover {
            color: rgba(255, 255, 255, 0.9);
          }
        }

        .yepper-ad-container {
          width: 100%;
          margin: 0;
          border-radius: clamp(6px, 1.5cqw, 8px);
          overflow: hidden;
          background: none;
        }
        
        .yepper-ad-item {
          display: block;
          width: ${customization.width ? customization.width + 'px' : '100%'} !important;
          height: ${customization.height ? customization.height + 'px' : 'auto'} !important;
          text-decoration: none;
          overflow: hidden;
          background: ${customization.backgroundColor || 'rgba(255, 255, 255, 0.25)'} !important;
          ${customization.glassmorphism !== false ? 'backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);' : ''}
          border: ${customization.borderWidth || 1}px solid ${customization.borderColor || 'rgba(255, 255, 255, 0.18)'} !important;
          border-radius: ${customization.borderRadius || 16}px !important;
          box-shadow: ${customization.shadow === 'none' ? 'none' : customization.shadow === 'small' ? '0 2px 4px rgba(0,0,0,0.1)' : customization.shadow === 'large' ? '0 20px 50px rgba(0,0,0,0.3)' : '0 8px 32px rgba(31, 38, 135, 0.37)'};
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          color: inherit;
          padding: ${customization.padding || 0}px !important;
        }
        
        ${customization.hoverEffect !== false ? `.yepper-ad-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 clamp(8px, 2cqw, 15px) clamp(18px, 4.5cqw, 35px) 0 rgba(31, 38, 135, 0.4);
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.35);
        }` : ''}
        
        .yepper-ad-link {
          display: block;
          color: inherit;
          text-decoration: none;
          height: 100%;
        }
        
        .yepper-ad-header {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: rgba(0, 0, 0, 0.8);
          padding: clamp(4px, 1cqw, 8px) clamp(8px, 2cqw, 16px);
          font-size: clamp(8px, 2cqw, 11px);
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: clamp(20px, 4cqw, 32px);
          letter-spacing: 0.01em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .yepper-ad-header-logo {
          font-weight: 600;
          font-size: clamp(8px, 2cqw, 11px);
          opacity: 0.7;
        }
        
        .yepper-ad-header-badge {
          background: rgba(255, 255, 255, 0.2);
          padding: clamp(2px, 0.5cqw, 3px) clamp(4px, 1cqw, 8px);
          border-radius: clamp(8px, 2cqw, 12px);
          font-size: clamp(7px, 1.8cqw, 9px);
          font-weight: 500;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 60%;
        }
        
        @container ad-wrapper (max-width: 250px) {
          .yepper-ad-header-badge {
            display: none;
          }
        }
        
        .yepper-ad-content {
          padding: clamp(10px, 2.5cqw, 18px);
          background: transparent;
        }
        
        .yepper-ad-image-wrapper {
          width: 100%;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          position: relative;
          border-radius: clamp(6px, 1.5cqw, 12px);
          margin-bottom: clamp(8px, 2cqw, 16px);
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(5px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          ${customization.showImage === false ? 'display: none !important;' : ''}
        }
        
        @container ad-wrapper (max-width: 280px) {
          .yepper-ad-image-wrapper {
            aspect-ratio: 1 / 1;
          }
        }
        
        .yepper-ad-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.3s ease;
          border-radius: clamp(5px, 1.4cqw, 11px);
        }
        
        .yepper-ad-item:hover .yepper-ad-image {
          transform: scale(1.02);
        }
        
        .yepper-ad-business-name {
          font-size: ${customization.titleSize || 16}px !important;
          font-weight: 600;
          color: ${customization.titleColor || 'rgba(0, 0, 0, 0.9)'} !important;
          margin: 0 0 clamp(6px, 1.5cqw, 10px) 0;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          letter-spacing: -0.01em;
        }
        
        @container ad-wrapper (max-width: 250px) {
          .yepper-ad-business-name {
            -webkit-line-clamp: 1;
          }
        }
        
        .yepper-ad-description {
          font-size: ${customization.descriptionSize || 13}px !important;
          color: ${customization.descriptionColor || 'rgba(0, 0, 0, 0.6)'} !important;
          line-height: 1.5;
          margin: 0 0 clamp(10px, 2cqw, 16px) 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          ${customization.showDescription === false ? 'display: none !important;' : ''}
        }
        
        @container ad-wrapper (max-width: 280px) {
          .yepper-ad-description {
            display: none;
          }
        }
        
        .yepper-ad-cta {
          display: inline-flex;
          align-items: center;
          background: ${customization.ctaBackground || 'rgba(255, 255, 255, 0.2)'} !important;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: ${customization.ctaColor || 'rgba(0, 0, 0, 0.8)'} !important;
          padding: clamp(6px, 1.5cqw, 10px) clamp(10px, 2.5cqw, 18px);
          border-radius: clamp(6px, 1.5cqw, 10px);
          font-size: ${customization.ctaSize || 12}px !important;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.2);
          ${customization.showCTA === false ? 'display: none !important;' : ''}
        }
        
        .yepper-ad-cta:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.3);
        }
        
        .yepper-ad-footer {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding: clamp(5px, 1.2cqw, 10px) clamp(8px, 2cqw, 16px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: clamp(7px, 1.8cqw, 10px);
          color: rgba(0, 0, 0, 0.5);
          min-height: clamp(18px, 3.5cqw, 28px);
        }
        
        .yepper-ad-footer-brand {
          font-weight: 500;
          color: rgba(0, 0, 0, 0.4);
        }
        
        .yepper-ad-footer-business {
          font-style: italic;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 60%;
          color: rgba(0, 0, 0, 0.3);
        }
        
        @media (prefers-color-scheme: dark) {
          .yepper-ad-item {
            background: rgba(0, 0, 0, 0.25);
            border-color: rgba(255, 255, 255, 0.18);
            box-shadow: 0 clamp(4px, 1cqw, 8px) clamp(16px, 4cqw, 32px) 0 rgba(0, 0, 0, 0.37);
          }
          
          .yepper-ad-item:hover {
            background: rgba(0, 0, 0, 0.35);
            border-color: rgba(255, 255, 255, 0.3);
            box-shadow: 0 clamp(8px, 2cqw, 15px) clamp(18px, 4.5cqw, 35px) 0 rgba(0, 0, 0, 0.5);
          }
          
          .yepper-ad-header {
            background: rgba(0, 0, 0, 0.1);
            color: rgba(255, 255, 255, 0.9);
            border-bottom-color: rgba(255, 255, 255, 0.1);
          }
          
          .yepper-ad-header-badge {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.1);
          }
          
          .yepper-ad-business-name {
            color: rgba(255, 255, 255, 0.95);
          }
          
          .yepper-ad-description {
            color: rgba(255, 255, 255, 0.7);
          }
          
          .yepper-ad-image-wrapper {
            background: rgba(0, 0, 0, 0.1);
            border-color: rgba(255, 255, 255, 0.1);
          }
          
          .yepper-ad-cta {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.9);
            border-color: rgba(255, 255, 255, 0.2);
          }
          
          .yepper-ad-cta:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.3);
          }
          
          .yepper-ad-footer {
            background: rgba(0, 0, 0, 0.05);
            border-color: rgba(255, 255, 255, 0.1);
          }
          
          .yepper-ad-footer-brand {
            color: rgba(255, 255, 255, 0.5);
          }
          
          .yepper-ad-footer-business {
            color: rgba(255, 255, 255, 0.4);
          }
        }
        
        .yepper-ad-empty {
          padding: clamp(16px, 4cqw, 28px) clamp(14px, 3.5cqw, 24px);
          text-align: center;
          background: #f1f1f1ff;
          border-radius: clamp(8px, 2cqw, 12px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: clamp(10px, 2.5cqw, 16px);
          position: relative;
          overflow: hidden;
        }

        .yepper-ad-empty::before {
          content: '';
          position: absolute;
          top: -30px;
          right: -30px;
          width: clamp(60px, 15cqw, 100px);
          height: clamp(60px, 15cqw, 100px);
          background: radial-gradient(circle at center, rgba(234, 103, 51, 1) 0%, transparent 65%);
          pointer-events: none;
        }

        .yepper-ad-empty::after {
          content: '';
          position: absolute;
          bottom: -25px;
          left: -25px;
          width: clamp(55px, 13.5cqw, 90px);
          height: clamp(55px, 13.5cqw, 90px);
          background: radial-gradient(circle at center, rgba(59, 131, 246, 1) 0%, transparent 65%);
          pointer-events: none;
        }
        
        .yepper-ad-empty-title {
          font-size: clamp(13px, 3.5cqw, 18px);
          font-weight: 600;
          margin-bottom: clamp(2px, 0.5cqw, 4px);
          letter-spacing: -0.01em;
          color: #000;
        }
        
        .yepper-ad-empty-text {
          font-size: clamp(12px, 3cqw, 15px);
          font-weight: 500;
          margin-bottom: clamp(10px, 2.5cqw, 16px);
          color: #000;
        }
        
        .yepper-ad-empty-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: clamp(8px, 2cqw, 12px) clamp(16px, 4cqw, 28px);
          background: #000;
          color: #ffffff;
          text-decoration: none;
          border-radius: clamp(6px, 1.5cqw, 8px);
          font-size: clamp(11px, 2.8cqw, 14px);
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: all 0.2s ease;
          border: none;
          box-shadow: 0 2px 8px rgba(2, 132, 188, 0.25);
        }
        
        .yepper-ad-empty-link:hover {
          transform: translateY(-1px);
          background: #FF4500;
          box-shadow: 0 4px 12px rgba(255, 69, 0, 0.3);
        }
        
        @media (prefers-color-scheme: dark) {
          .yepper-ad-empty {
            background: linear-gradient(135deg, rgba(76, 81, 191, 0.15) 0%, rgba(85, 60, 154, 0.15) 100%);
            border-color: rgba(124, 58, 237, 0.3);
            box-shadow: 0 2px 8px rgba(124, 58, 237, 0.2);
          }
          
          .yepper-ad-empty-title {
            color: #e2e8f0;
          }
          
          .yepper-ad-empty-text {
            color: #a0aec0;
          }
          
          .yepper-ad-empty-link {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
          }
          
          .yepper-ad-empty-link:hover {
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .yepper-ad-item,
          .yepper-ad-image,
          .yepper-ad-cta,
          .yepper-ad-empty,
          .yepper-ad-empty-link {
            transition: none;
          }
          
          .yepper-ad-item:hover,
          .yepper-ad-empty:hover {
            transform: none;
          }
          
          .yepper-ad-empty::before,
          .yepper-ad-empty::after {
            display: none;
          }
        }
      \`;
      
      const styleEl = d.createElement('style');
      styleEl.textContent = styles;
      d.head.appendChild(styleEl);
      
      const createPoweredBy = () => {
        return '<div class="yepper-powered-by">Powered by <a href="https://yepper.com" target="_blank" rel="noopener noreferrer" class="yepper-powered-by-link">Yepper</a></div>';
      };
      
      const insertContainer = () => {
        let scriptEl = d.currentScript;
        
        if (!scriptEl) {
          const scripts = d.getElementsByTagName('script');
          for (let i = scripts.length - 1; i >= 0; i--) {
            if (scripts[i].src && scripts[i].src.includes('/api/ads/script/' + _i)) {
              scriptEl = scripts[i];
              break;
            }
          }
        }
        
        const container = d.createElement('div');
        container.className = 'yepper-ad-wrapper';
        container.setAttribute('data-script-id', _i);
        
        if (scriptEl && scriptEl.parentNode) {
          scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling);
          return container;
        }
        
        d.body.appendChild(container);
        return container;
      };
      
      const showEmptyState = (container) => {
        const translations = {
          english: {
            title: "Available Advertising Space",
            price: "Price",
            action: "Advertise Here"
          },
          french: {
            title: "Espace Publicitaire Disponible",
            price: "Prix",
            action: "Annoncez Ici"
          },
          kinyarwanda: {
            title: "Kwamamaza",
            price: "Igiciro cy'ukwezi",
            action: "Kanda Hano"
          },
          kiswahili: {
            title: "Nafasi ya Matangazo Inapatikana",
            price: "Bei",
            action: "Tangaza Hapa"
          },
          chinese: {
            title: "可用广告空间",
            price: "价格",
            action: "在此广告"
          },
          spanish: {
            title: "Espacio Publicitario Disponible",
            price: "Precio",
            action: "Anuncie Aquí"
          }
        };
        
        let currentLang = _l;
        
        if (!translations[currentLang]) {
          let userLang = navigator.language || navigator.userLanguage;
          userLang = userLang.toLowerCase().split('-')[0];
          
          currentLang = 'english';
          if (userLang === 'fr') currentLang = 'french';
          if (userLang === 'rw') currentLang = 'kinyarwanda';
          if (userLang === 'sw') currentLang = 'kiswahili';
          if (userLang === 'zh') currentLang = 'chinese';
          if (userLang === 'es') currentLang = 'spanish';
        }
        
        container.innerHTML = 
          createPoweredBy() +
          '<div class="yepper-ad-empty">' +
            '<div class="yepper-ad-empty-title"><h3>' + translations[currentLang].title + '</h3></div>' +
            '<div class="yepper-ad-empty-text"><p>' + translations[currentLang].price + ' $' + _p + '</p></div>' +
            '<a href="http://localhost:3000/direct-ad?websiteId=' + _w + '&categoryId=' + _i + '" class="yepper-ad-empty-link">' +
              '<span>' + translations[currentLang].action + '</span>' +
            '</a>' +
          '</div>';
      };
      
      const container = insertContainer();
      
      fetch(_b + "/ads/display?categoryId=" + _i)
        .then(response => response.json())
        .then(data => {
          if (!data || !data.html) {
            showEmptyState(container);
            return;
          }
          
          container.innerHTML = createPoweredBy() + data.html;
          
          const items = Array.from(container.getElementsByClassName("yepper-ad-item"));
          
          if (!items.length) {
            showEmptyState(container);
            return;
          }
          
          items.forEach((e, index) => {
            if (index !== 0) e.style.display = "none";
          });
          
          items.forEach(e => {
            const link = e.querySelector('.yepper-ad-link');
            if (!link) return;
            
            const i = e.dataset.adId;
            
            if (e.style.display !== "none") {
              fetch(_b + "/ads/view/" + i, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              }).catch(console.error);
            }
            
            link.onclick = ev => {
              ev.preventDefault();
              fetch(_b + "/ads/click/" + i, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              })
              .then(() => window.open(link.href, '_blank'))
              .catch(() => window.open(link.href, '_blank'));
              return false;
            };
          });
          
          if (items.length > 1) {
            let x = 0;
            setInterval(() => {
              items[x].style.display = "none";
              x = (x + 1) % items.length;
              items[x].style.display = "block";
              
              const i = items[x].dataset.adId;
              if (i) {
                fetch(_b + "/ads/view/" + i, {
                  method: 'POST',
                  mode: 'cors',
                  credentials: 'omit'
                }).catch(console.error);
              }
            }, _t);
          }
        })
        .catch(() => {
          showEmptyState(container);
        });
    })();
    `;
    
    res.send(adScript);
  } catch (error) {
    console.error('Error serving ad script:', error);
    res.status(500).send('// Error serving ad script');
  }
};

// exports.serveAdScript = async (req, res) => {
//   try {
//     const { scriptId } = req.params;
//     const adCategory = await AdCategory.findById(scriptId)
//       .populate('websiteId')
//       .lean();
    
//     if (!adCategory) {
//       return res.status(404).send('Ad category not found');
//     }

//     const customization = adCategory.customization || {};
    
//     // Generate dynamic CSS from customization
//     const customCSS = customization ? `
//       .yepper-ad-item {
//         width: ${customization.width || 600}px !important;
//         height: ${customization.height || 300}px !important;
//         border-radius: ${customization.borderRadius || 16}px !important;
//         padding: ${customization.padding || 18}px !important;
//         background: ${customization.backgroundColor || 'rgba(255, 255, 255, 0.25)'} !important;
//         border: ${customization.borderWidth || 1}px solid ${customization.borderColor || 'rgba(255, 255, 255, 0.18)'} !important;
//         ${customization.glassmorphism ? 'backdrop-filter: blur(10px) !important;' : ''}
//       }
      
//       .yepper-ad-image-wrapper {
//         ${!customization.showImage ? 'display: none !important;' : ''}
//       }
      
//       .yepper-ad-description {
//         font-size: ${customization.descriptionSize || 13}px !important;
//         ${!customization.showDescription ? 'display: none !important;' : ''}
//       }
      
//       .yepper-ad-business-name {
//         font-size: ${customization.titleSize || 16}px !important;
//         color: ${customization.titleColor || 'rgba(0, 0, 0, 0.9)'} !important;
//       }
      
//       .yepper-ad-cta {
//         font-size: ${customization.ctaSize || 12}px !important;
//         background: ${customization.ctaBackground || 'rgba(255, 255, 255, 0.2)'} !important;
//         color: ${customization.ctaColor || 'rgba(0, 0, 0, 0.8)'} !important;
//         ${!customization.showCTA ? 'display: none !important;' : ''}
//       }
//     ` : '';
    
//     const categoryPrice = adCategory.price;
//     const defaultLanguage = adCategory.defaultLanguage || 'english';
//     const websiteId = adCategory.websiteId._id;
//     const websiteName = adCategory.websiteId.websiteName || 'This website';
//     const categoryName = adCategory.categoryName || 'this space';
    
//     // Set proper content type and cache headers
//     res.setHeader('Content-Type', 'application/javascript');
//     res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
//     res.setHeader('Pragma', 'no-cache');
//     res.setHeader('Expires', '0');
    
//     // Generate the complete ad script with adaptive responsive design
//     const adScript = `
    
//     (function() {
//       const d = document,
//         _i = "${scriptId}",
//         _w = "${websiteId}",
//         _wName = "${websiteName}",
//         _cName = "${categoryName}",
//         _b = "http://localhost:5000/api",
//         _t = 5000,
//         _p = ${categoryPrice},
//         _l = "${defaultLanguage}";
    
//       // Create and append styles with container queries for magical adaptive sizing
//       const styles = \`
//         /* Base styles */
//         ${existingStyles}
        
//         /* Custom overrides */
//         ${customCSS}

//         .yepper-ad-wrapper {
//           font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
//           width: 100%;
//           max-width: 100%;
//           overflow: hidden;
//           margin: 0;
//           line-height: 1.4;
//           background: none;
//           container-type: inline-size;
//           container-name: ad-wrapper;
//         }

//         /* Powered by Yepper branding - Fluid sizing */
//         .yepper-powered-by {
//           text-align: center;
//           padding: clamp(4px, 1.5cqw, 8px) clamp(6px, 2cqw, 12px);
//           font-size: clamp(7px, 2cqw, 10px);
//           color: rgba(0, 0, 0, 0.5);
//           font-weight: 500;
//           letter-spacing: 0.02em;
//           margin-bottom: clamp(4px, 1.5cqw, 8px);
//         }

//         .yepper-powered-by-link {
//           color: rgba(0, 0, 0, 0.6);
//           text-decoration: none;
//           font-weight: 600;
//           transition: color 0.2s ease;
//         }

//         .yepper-powered-by-link:hover {
//           color: rgba(0, 0, 0, 0.8);
//         }

//         @media (prefers-color-scheme: dark) {
//           .yepper-powered-by {
//             color: rgba(255, 255, 255, 0.5);
//           }

//           .yepper-powered-by-link {
//             color: rgba(255, 255, 255, 0.6);
//           }

//           .yepper-powered-by-link:hover {
//             color: rgba(255, 255, 255, 0.9);
//           }
//         }

//         .yepper-ad-container {
//           width: 100%;
//           margin: 0;
//           border-radius: clamp(6px, 1.5cqw, 8px);
//           overflow: hidden;
//           background: none;
//         }
        
//         /* Glass Morphism Ad Design - Fully Adaptive */
//         .yepper-ad-item {
//           display: block;
//           width: 100%;
//           text-decoration: none;
//           overflow: hidden;
//           background: rgba(255, 255, 255, 0.25);
//           backdrop-filter: blur(10px);
//           -webkit-backdrop-filter: blur(10px);
//           border: 1px solid rgba(255, 255, 255, 0.18);
//           border-radius: clamp(8px, 2cqw, 16px);
//           box-shadow: 0 clamp(4px, 1cqw, 8px) clamp(16px, 4cqw, 32px) 0 rgba(31, 38, 135, 0.37);
//           transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
//           position: relative;
//           color: inherit;
//         }
        
//         .yepper-ad-item:hover {
//           transform: translateY(-2px);
//           box-shadow: 0 clamp(8px, 2cqw, 15px) clamp(18px, 4.5cqw, 35px) 0 rgba(31, 38, 135, 0.4);
//           border-color: rgba(255, 255, 255, 0.3);
//           background: rgba(255, 255, 255, 0.35);
//         }
        
//         .yepper-ad-link {
//           display: block;
//           color: inherit;
//           text-decoration: none;
//           height: 100%;
//         }
        
//         .yepper-ad-header {
//           background: rgba(255, 255, 255, 0.1);
//           backdrop-filter: blur(10px);
//           -webkit-backdrop-filter: blur(10px);
//           color: rgba(0, 0, 0, 0.8);
//           padding: clamp(4px, 1cqw, 8px) clamp(8px, 2cqw, 16px);
//           font-size: clamp(8px, 2cqw, 11px);
//           font-weight: 500;
//           display: flex;
//           align-items: center;
//           justify-content: space-between;
//           min-height: clamp(20px, 4cqw, 32px);
//           letter-spacing: 0.01em;
//           border-bottom: 1px solid rgba(255, 255, 255, 0.1);
//         }
        
//         .yepper-ad-header-logo {
//           font-weight: 600;
//           font-size: clamp(8px, 2cqw, 11px);
//           opacity: 0.7;
//         }
        
//         .yepper-ad-header-badge {
//           background: rgba(255, 255, 255, 0.2);
//           padding: clamp(2px, 0.5cqw, 3px) clamp(4px, 1cqw, 8px);
//           border-radius: clamp(8px, 2cqw, 12px);
//           font-size: clamp(7px, 1.8cqw, 9px);
//           font-weight: 500;
//           backdrop-filter: blur(10px);
//           border: 1px solid rgba(255, 255, 255, 0.1);
//           white-space: nowrap;
//           overflow: hidden;
//           text-overflow: ellipsis;
//           max-width: 60%;
//         }
        
//         /* Container query for very small spaces - hide badge */
//         @container ad-wrapper (max-width: 250px) {
//           .yepper-ad-header-badge {
//             display: none;
//           }
//         }
        
//         .yepper-ad-content {
//           padding: clamp(10px, 2.5cqw, 18px);
//           background: transparent;
//         }
        
//         .yepper-ad-image-wrapper {
//           width: 100%;
//           aspect-ratio: 16 / 9;
//           overflow: hidden;
//           position: relative;
//           border-radius: clamp(6px, 1.5cqw, 12px);
//           margin-bottom: clamp(8px, 2cqw, 16px);
//           background: rgba(255, 255, 255, 0.1);
//           backdrop-filter: blur(5px);
//           border: 1px solid rgba(255, 255, 255, 0.1);
//         }
        
//         /* For very small containers, use 1:1 aspect ratio */
//         @container ad-wrapper (max-width: 280px) {
//           .yepper-ad-image-wrapper {
//             aspect-ratio: 1 / 1;
//           }
//         }
        
//         .yepper-ad-image {
//           width: 100%;
//           height: 100%;
//           object-fit: cover;
//           display: block;
//           transition: transform 0.3s ease;
//           border-radius: clamp(5px, 1.4cqw, 11px);
//         }
        
//         .yepper-ad-item:hover .yepper-ad-image {
//           transform: scale(1.02);
//         }
        
//         .yepper-ad-business-name {
//           font-size: clamp(11px, 3cqw, 16px);
//           font-weight: 600;
//           color: rgba(0, 0, 0, 0.9);
//           margin: 0 0 clamp(6px, 1.5cqw, 10px) 0;
//           line-height: 1.3;
//           display: -webkit-box;
//           -webkit-line-clamp: 2;
//           -webkit-box-orient: vertical;
//           overflow: hidden;
//           letter-spacing: -0.01em;
//         }
        
//         /* For very small containers, limit to 1 line */
//         @container ad-wrapper (max-width: 250px) {
//           .yepper-ad-business-name {
//             -webkit-line-clamp: 1;
//           }
//         }
        
//         .yepper-ad-description {
//           font-size: clamp(10px, 2.5cqw, 13px);
//           color: rgba(0, 0, 0, 0.6);
//           line-height: 1.5;
//           margin: 0 0 clamp(10px, 2cqw, 16px) 0;
//           display: -webkit-box;
//           -webkit-line-clamp: 2;
//           -webkit-box-orient: vertical;
//           overflow: hidden;
//         }
        
//         /* For very small containers, hide description */
//         @container ad-wrapper (max-width: 280px) {
//           .yepper-ad-description {
//             display: none;
//           }
//         }
        
//         .yepper-ad-cta {
//           display: inline-flex;
//           align-items: center;
//           background: rgba(255, 255, 255, 0.2);
//           backdrop-filter: blur(10px);
//           -webkit-backdrop-filter: blur(10px);
//           color: rgba(0, 0, 0, 0.8);
//           padding: clamp(6px, 1.5cqw, 10px) clamp(10px, 2.5cqw, 18px);
//           border-radius: clamp(6px, 1.5cqw, 10px);
//           font-size: clamp(10px, 2.2cqw, 12px);
//           font-weight: 500;
//           letter-spacing: 0.01em;
//           transition: all 0.3s ease;
//           border: 1px solid rgba(255, 255, 255, 0.2);
//         }
        
//         .yepper-ad-cta:hover {
//           transform: translateY(-1px);
//           background: rgba(255, 255, 255, 0.3);
//           border-color: rgba(255, 255, 255, 0.3);
//         }
        
//         .yepper-ad-footer {
//           background: rgba(255, 255, 255, 0.05);
//           backdrop-filter: blur(10px);
//           border-top: 1px solid rgba(255, 255, 255, 0.1);
//           padding: clamp(5px, 1.2cqw, 10px) clamp(8px, 2cqw, 16px);
//           display: flex;
//           align-items: center;
//           justify-content: space-between;
//           font-size: clamp(7px, 1.8cqw, 10px);
//           color: rgba(0, 0, 0, 0.5);
//           min-height: clamp(18px, 3.5cqw, 28px);
//         }
        
//         .yepper-ad-footer-brand {
//           font-weight: 500;
//           color: rgba(0, 0, 0, 0.4);
//         }
        
//         .yepper-ad-footer-business {
//           font-style: italic;
//           white-space: nowrap;
//           overflow: hidden;
//           text-overflow: ellipsis;
//           max-width: 60%;
//           color: rgba(0, 0, 0, 0.3);
//         }
        
//         /* Dark theme adaptation */
//         @media (prefers-color-scheme: dark) {
//           .yepper-ad-item {
//             background: rgba(0, 0, 0, 0.25);
//             border-color: rgba(255, 255, 255, 0.18);
//             box-shadow: 0 clamp(4px, 1cqw, 8px) clamp(16px, 4cqw, 32px) 0 rgba(0, 0, 0, 0.37);
//           }
          
//           .yepper-ad-item:hover {
//             background: rgba(0, 0, 0, 0.35);
//             border-color: rgba(255, 255, 255, 0.3);
//             box-shadow: 0 clamp(8px, 2cqw, 15px) clamp(18px, 4.5cqw, 35px) 0 rgba(0, 0, 0, 0.5);
//           }
          
//           .yepper-ad-header {
//             background: rgba(0, 0, 0, 0.1);
//             color: rgba(255, 255, 255, 0.9);
//             border-bottom-color: rgba(255, 255, 255, 0.1);
//           }
          
//           .yepper-ad-header-badge {
//             background: rgba(255, 255, 255, 0.1);
//             border-color: rgba(255, 255, 255, 0.1);
//           }
          
//           .yepper-ad-business-name {
//             color: rgba(255, 255, 255, 0.95);
//           }
          
//           .yepper-ad-description {
//             color: rgba(255, 255, 255, 0.7);
//           }
          
//           .yepper-ad-image-wrapper {
//             background: rgba(0, 0, 0, 0.1);
//             border-color: rgba(255, 255, 255, 0.1);
//           }
          
//           .yepper-ad-cta {
//             background: rgba(255, 255, 255, 0.1);
//             color: rgba(255, 255, 255, 0.9);
//             border-color: rgba(255, 255, 255, 0.2);
//           }
          
//           .yepper-ad-cta:hover {
//             background: rgba(255, 255, 255, 0.2);
//             border-color: rgba(255, 255, 255, 0.3);
//           }
          
//           .yepper-ad-footer {
//             background: rgba(0, 0, 0, 0.05);
//             border-color: rgba(255, 255, 255, 0.1);
//           }
          
//           .yepper-ad-footer-brand {
//             color: rgba(255, 255, 255, 0.5);
//           }
          
//           .yepper-ad-footer-business {
//             color: rgba(255, 255, 255, 0.4);
//           }
//         }
        
//         /* Enhanced Empty State - Fully Adaptive */
//         .yepper-ad-empty {
//           padding: clamp(16px, 4cqw, 28px) clamp(14px, 3.5cqw, 24px);
//           text-align: center;
//           background: #f1f1f1ff;
//           border-radius: clamp(8px, 2cqw, 12px);
//           display: flex;
//           flex-direction: column;
//           align-items: center;
//           justify-content: center;
//           gap: clamp(10px, 2.5cqw, 16px);
//           position: relative;
//           overflow: hidden;
//         }

//         .yepper-ad-empty::before {
//           content: '';
//           position: absolute;
//           top: -30px;
//           right: -30px;
//           width: clamp(60px, 15cqw, 100px);
//           height: clamp(60px, 15cqw, 100px);
//           background: radial-gradient(circle at center, rgba(234, 103, 51, 1) 0%, transparent 65%);
//           pointer-events: none;
//         }

//         .yepper-ad-empty::after {
//           content: '';
//           position: absolute;
//           bottom: -25px;
//           left: -25px;
//           width: clamp(55px, 13.5cqw, 90px);
//           height: clamp(55px, 13.5cqw, 90px);
//           background: radial-gradient(circle at center, rgba(59, 131, 246, 1) 0%, transparent 65%);
//           pointer-events: none;
//         }
        
//         .yepper-ad-empty-title {
//           font-size: clamp(13px, 3.5cqw, 18px);
//           font-weight: 600;
//           margin-bottom: clamp(2px, 0.5cqw, 4px);
//           letter-spacing: -0.01em;
//           color: #000;
//         }
        
//         .yepper-ad-empty-text {
//           font-size: clamp(12px, 3cqw, 15px);
//           font-weight: 500;
//           margin-bottom: clamp(10px, 2.5cqw, 16px);
//           color: #000;
//         }
        
//         .yepper-ad-empty-link {
//           display: inline-flex;
//           align-items: center;
//           justify-content: center;
//           padding: clamp(8px, 2cqw, 12px) clamp(16px, 4cqw, 28px);
//           background: #000;
//           color: #ffffff;
//           text-decoration: none;
//           border-radius: clamp(6px, 1.5cqw, 8px);
//           font-size: clamp(11px, 2.8cqw, 14px);
//           font-weight: 600;
//           letter-spacing: 0.02em;
//           transition: all 0.2s ease;
//           border: none;
//           box-shadow: 0 2px 8px rgba(2, 132, 188, 0.25);
//         }
        
//         .yepper-ad-empty-link:hover {
//           transform: translateY(-1px);
//           background: #FF4500;
//           box-shadow: 0 4px 12px rgba(255, 69, 0, 0.3);
//         }
        
//         /* Dark mode for empty state */
//         @media (prefers-color-scheme: dark) {
//           .yepper-ad-empty {
//             background: linear-gradient(135deg, rgba(76, 81, 191, 0.15) 0%, rgba(85, 60, 154, 0.15) 100%);
//             border-color: rgba(124, 58, 237, 0.3);
//             box-shadow: 0 2px 8px rgba(124, 58, 237, 0.2);
//           }
          
//           .yepper-ad-empty-title {
//             color: #e2e8f0;
//           }
          
//           .yepper-ad-empty-text {
//             color: #a0aec0;
//           }
          
//           .yepper-ad-empty-link {
//             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//             box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
//           }
          
//           .yepper-ad-empty-link:hover {
//             box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
//             background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
//           }
//         }
        
//         /* Reduced motion preferences */
//         @media (prefers-reduced-motion: reduce) {
//           .yepper-ad-item,
//           .yepper-ad-image,
//           .yepper-ad-cta,
//           .yepper-ad-empty,
//           .yepper-ad-empty-link {
//             transition: none;
//           }
          
//           .yepper-ad-item:hover,
//           .yepper-ad-empty:hover {
//             transform: none;
//           }
          
//           .yepper-ad-empty::before,
//           .yepper-ad-empty::after {
//             display: none;
//           }
//         }
//       \`;
      
//       const styleEl = d.createElement('style');
//       styleEl.textContent = styles;
//       d.head.appendChild(styleEl);
      
//       // Function to create "Powered by Yepper" branding
//       const createPoweredBy = () => {
//         return '<div class="yepper-powered-by">Powered by <a href="https://yepper.com" target="_blank" rel="noopener noreferrer" class="yepper-powered-by-link">Yepper</a></div>';
//       };
      
//       // Function to insert container after the current script
//       const insertContainer = () => {
//         let scriptEl = d.currentScript;
        
//         if (!scriptEl) {
//           const scripts = d.getElementsByTagName('script');
//           for (let i = scripts.length - 1; i >= 0; i--) {
//             if (scripts[i].src && scripts[i].src.includes('/api/ads/script/' + _i)) {
//               scriptEl = scripts[i];
//               break;
//             }
//           }
//         }
        
//         const container = d.createElement('div');
//         container.className = 'yepper-ad-wrapper';
//         container.setAttribute('data-script-id', _i);
        
//         if (scriptEl && scriptEl.parentNode) {
//           scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling);
//           return container;
//         }
        
//         d.body.appendChild(container);
//         return container;
//       };
      
//       // Function to show empty state with multiple languages
//       const showEmptyState = (container) => {
//         const translations = {
//           english: {
//             title: "Available Advertising Space",
//             price: "Price",
//             action: "Advertise Here"
//           },
//           french: {
//             title: "Espace Publicitaire Disponible",
//             price: "Prix",
//             action: "Annoncez Ici"
//           },
//           kinyarwanda: {
//             title: "Kwamamaza",
//             price: "Igiciro cy'ukwezi",
//             action: "Kanda Hano"
//           },
//           kiswahili: {
//             title: "Nafasi ya Matangazo Inapatikana",
//             price: "Bei",
//             action: "Tangaza Hapa"
//           },
//           chinese: {
//             title: "可用广告空间",
//             price: "价格",
//             action: "在此广告"
//           },
//           spanish: {
//             title: "Espacio Publicitario Disponible",
//             price: "Precio",
//             action: "Anuncie Aquí"
//           }
//         };
        
//         let currentLang = _l;
        
//         if (!translations[currentLang]) {
//           let userLang = navigator.language || navigator.userLanguage;
//           userLang = userLang.toLowerCase().split('-')[0];
          
//           currentLang = 'english';
//           if (userLang === 'fr') currentLang = 'french';
//           if (userLang === 'rw') currentLang = 'kinyarwanda';
//           if (userLang === 'sw') currentLang = 'kiswahili';
//           if (userLang === 'zh') currentLang = 'chinese';
//           if (userLang === 'es') currentLang = 'spanish';
//         }
        
//         container.innerHTML = 
//           createPoweredBy() +
//           '<div class="yepper-ad-empty">' +
//             '<div class="yepper-ad-empty-title"><h3>' + translations[currentLang].title + '</h3></div>' +
//             '<div class="yepper-ad-empty-text"><p>' + translations[currentLang].price + ' $' + _p + '</p></div>' +
//             '<a href="http://localhost:3000/direct-ad?websiteId=' + _w + '&categoryId=' + _i + '" class="yepper-ad-empty-link">' +
//               '<span>' + translations[currentLang].action + '</span>' +
//             '</a>' +
//           '</div>';
//       };
      
//       // Insert container for ads
//       const container = insertContainer();
      
//       // Fetch ads
//       fetch(_b + "/ads/display?categoryId=" + _i)
//         .then(response => response.json())
//         .then(data => {
//           if (!data || !data.html) {
//             showEmptyState(container);
//             return;
//           }
          
//           container.innerHTML = createPoweredBy() + data.html;
          
//           const items = Array.from(container.getElementsByClassName("yepper-ad-item"));
          
//           if (!items.length) {
//             showEmptyState(container);
//             return;
//           }
          
//           items.forEach((e, index) => {
//             if (index !== 0) e.style.display = "none";
//           });
          
//           items.forEach(e => {
//             const link = e.querySelector('.yepper-ad-link');
//             if (!link) return;
            
//             const i = e.dataset.adId;
            
//             if (e.style.display !== "none") {
//               fetch(_b + "/ads/view/" + i, {
//                 method: 'POST',
//                 mode: 'cors',
//                 credentials: 'omit'
//               }).catch(console.error);
//             }
            
//             link.onclick = ev => {
//               ev.preventDefault();
//               fetch(_b + "/ads/click/" + i, {
//                 method: 'POST',
//                 mode: 'cors',
//                 credentials: 'omit'
//               })
//               .then(() => window.open(link.href, '_blank'))
//               .catch(() => window.open(link.href, '_blank'));
//               return false;
//             };
//           });
          
//           if (items.length > 1) {
//             let x = 0;
//             setInterval(() => {
//               items[x].style.display = "none";
//               x = (x + 1) % items.length;
//               items[x].style.display = "block";
              
//               const i = items[x].dataset.adId;
//               if (i) {
//                 fetch(_b + "/ads/view/" + i, {
//                   method: 'POST',
//                   mode: 'cors',
//                   credentials: 'omit'
//                 }).catch(console.error);
//               }
//             }, _t);
//           }
//         })
//         .catch(() => {
//           showEmptyState(container);
//         });
//     })();
    
//     `;
    
//     res.setHeader('Content-Type', 'application/javascript');
//     res.send(adScript);
//   } catch (error) {
//     console.error('Error serving ad script:', error);
//     res.status(500).send('// Error serving ad script');
//   }
// };