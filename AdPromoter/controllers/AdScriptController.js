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
    
    const categoryPrice = adCategory.price;
    const defaultLanguage = adCategory.defaultLanguage || 'english';
    const websiteId = adCategory.websiteId._id;
    const websiteName = adCategory.websiteId.websiteName || 'This website';
    const categoryName = adCategory.categoryName || 'this space';
    
    const timestamp = Date.now();
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('ETag', `"${scriptId}-${timestamp}"`);
    
    // Use string concatenation instead of nested template literals
    const adScript = `
    (function() {
      const d = document,
        _i = "${scriptId}",
        _w = "${websiteId}",
        _wName = "${websiteName}",
        _cName = "${categoryName}",
        _b = "https://yepper-backend-test.onrender.com/api",
        _t = 5000,
        _p = ${categoryPrice},
        _l = "${defaultLanguage}";
      
      let customization = {};
      
      const loadCustomization = async () => {
        try {
          const response = await fetch(_b + "/ad-categories/ads/customization/" + _i + "?t=" + Date.now(), {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache'
            }
          });
          
          if (!response.ok) {
            throw new Error('Failed to load customization');
          }
          
          const data = await response.json();
          customization = data.customization || {};
          return customization;
        } catch (error) {
          console.error('Failed to load customization:', error);
          return {};
        }
      };
      
      // Generate scoped styles with unique class prefix
      const generateStyles = (custom) => {
        const prefix = 'yepper-ad-' + _i;
        
        const isHorizontal = custom.imagePosition === 'left';
        const flexDirection = isHorizontal ? 'row' : 'column';
        
        const imageFlexBasis = isHorizontal ? '40%' : 'auto';
        const imageHeight = isHorizontal ? '100%' : custom.height ? (custom.height * 0.5 + 'px') : '200px';
        
        let baseStyles = \`
          .\${prefix}-wrapper {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            width: 100%;
            max-width: 100%;
            overflow: hidden;
            margin: 0;
            line-height: 1.4;
            background: none;
            container-type: inline-size;
            container-name: ad-wrapper-\${_i};
          }

          .\${prefix}-powered-by {
            padding: clamp(4px, 1.5cqw, 8px) clamp(6px, 2cqw, 12px);
            font-size: clamp(7px, 2cqw, 10px);
            color: rgba(0, 0, 0, 0.5);
            font-weight: 500;
            letter-spacing: 0.02em;
            margin-bottom: clamp(4px, 1.5cqw, 8px);
          }

          .\${prefix}-powered-by-link {
            color: rgba(0, 0, 0, 0.6);
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s ease;
          }

          .\${prefix}-powered-by-link:hover {
            color: rgba(0, 0, 0, 0.8);
          }

          @media (prefers-color-scheme: dark) {
            .\${prefix}-powered-by {
              color: rgba(255, 255, 255, 0.5);
            }
            .\${prefix}-powered-by-link {
              color: rgba(255, 255, 255, 0.6);
            }
            .\${prefix}-powered-by-link:hover {
              color: rgba(255, 255, 255, 0.9);
            }
          }

          .\${prefix}-container {
            width: 100%;
            margin: 0;
            border-radius: clamp(6px, 1.5cqw, 8px);
            overflow: hidden;
            background: none;
          }
          
          .\${prefix}-item {
            display: block;
            width: \${custom.width ? custom.width + 'px' : '100%'};
            height: \${custom.height ? custom.height + 'px' : 'auto'};
            max-width: \${custom.maxWidth || 100}%;
            text-decoration: none;
            overflow: hidden;
            background: \${custom.backgroundColor || '#f1f1f1ff'};
            \${custom.glassmorphism !== false ? 'backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);' : ''}
            border: \${custom.borderWidth || 1}px solid \${custom.borderColor || 'rgba(255, 255, 255, 0.18)'};
            border-radius: \${custom.borderRadius || 16}px;
            box-shadow: \${custom.shadow === 'none' ? 'none' : custom.shadow === 'small' ? '0 2px 4px rgba(0,0,0,0.1)' : custom.shadow === 'large' ? '0 20px 50px rgba(0,0,0,0.3)' : '0 8px 32px rgba(31, 38, 135, 0.37)'};
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            color: inherit;
            padding: \${custom.padding || 0}px;
          }

          .\${prefix}-item::before {
            content: '';
            position: absolute;
            top: -30px;
            left: -30px;
            width: clamp(60px, 15cqw, 100px);
            height: clamp(60px, 15cqw, 100px);
            background: radial-gradient(circle at center, rgba(234, 103, 51, 1) 0%, transparent 65%);
            pointer-events: none;
          }

          .\${prefix}-item::after {
            content: '';
            position: absolute;
            bottom: -25px;
            right: -25px;
            width: clamp(55px, 13.5cqw, 90px);
            height: clamp(55px, 13.5cqw, 90px);
            background: radial-gradient(circle at center, rgba(59, 131, 246, 1) 0%, transparent 65%);
            pointer-events: none;
          }
          
          \${custom.hoverEffect !== false ? \`.\${prefix}-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 clamp(8px, 2cqw, 15px) clamp(18px, 4.5cqw, 35px) 0 rgba(31, 38, 135, 0.4);
            border-color: rgba(255, 255, 255, 0.3);
          }\` : ''}
          
          .\${prefix}-link {
            display: block;
            color: inherit;
            text-decoration: none;
            height: 100%;
          }
          
          .\${prefix}-content {
            padding: clamp(10px, 2.5cqw, 18px);
            background: transparent;
            height: 100%;
            display: flex;
            flex-direction: \${flexDirection};
            gap: clamp(12px, 3cqw, 20px);
            align-items: \${isHorizontal ? 'center' : 'stretch'};
          }
          
          .\${prefix}-image-wrapper {
            flex-shrink: 0;
            overflow: hidden;
            position: relative;
            border-radius: clamp(6px, 1.5cqw, 12px);
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            \${custom.showImage === false ? 'display: none;' : ''}
            
            \${isHorizontal ? \`
              flex-basis: \${imageFlexBasis};
              min-width: 150px;
              height: auto;
              align-self: stretch;
            \` : \`
              width: 100%;
              flex-basis: auto;
              min-height: 150px;
            \`}
          }
          
          \${!isHorizontal ? \`.\${prefix}-image-wrapper {
            max-height: \${imageHeight};
          }\` : ''}
          
          @container ad-wrapper-\${_i} (max-width: 280px) {
            .\${prefix}-content {
              flex-direction: column;
            }
            
            .\${prefix}-image-wrapper {
              width: 100%;
              aspect-ratio: 16 / 9;
              height: auto;
            }
          }
          
          .\${prefix}-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.3s ease;
            border-radius: clamp(5px, 1.4cqw, 11px);
          }
          
          .\${prefix}-item:hover .\${prefix}-image {
            transform: scale(1.02);
          }
          
          .\${prefix}-text-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-width: 0;
          }
          
          .\${prefix}-business-name {
            font-size: \${custom.titleSize || 16}px;
            font-weight: 600;
            color: \${custom.titleColor || 'rgba(0, 0, 0, 0.9)'};
            margin: 0 0 clamp(6px, 1.5cqw, 10px) 0;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            letter-spacing: -0.01em;
          }
          
          @container ad-wrapper-\${_i} (max-width: 250px) {
            .\${prefix}-business-name {
              -webkit-line-clamp: 1;
            }
          }
          
          .\${prefix}-description {
            padding: 10px 0;
            font-size: \${custom.descriptionSize || 15}px;
            color: \${custom.descriptionColor || 'rgba(0, 0, 0, 0.6)'};
            line-height: 1.5;
            margin: 0 0 clamp(10px, 2cqw, 16px) 0;
            display: -webkit-box;
            -webkit-line-clamp: \${isHorizontal ? '2' : '3'};
            -webkit-box-orient: vertical;
            overflow: hidden;
            flex: 1;
            \${custom.showDescription === false ? 'display: none;' : ''}
          }
          
          @container ad-wrapper-\${_i} (max-width: 280px) {
            .\${prefix}-description {
              -webkit-line-clamp: 2;
            }
          }
          
          @container ad-wrapper-\${_i} (min-aspect-ratio: 6/1) {
            .\${prefix}-content {
              flex-direction: row;
              align-items: center;
            }
            
            .\${prefix}-image-wrapper {
              flex-basis: 25%;
              max-width: 200px;
            }
            
            .\${prefix}-description {
              -webkit-line-clamp: 1;
            }
          }
          
          .\${prefix}-cta {
            display: inline-flex;
            align-items: center;
            align-self: flex-start;
            background: \${custom.ctaBackground || 'rgba(0, 0, 0, 1)'};
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            color: \${custom.ctaColor || 'rgba(255, 255, 255, 1)'};
            padding: clamp(6px, 1.5cqw, 10px) clamp(30px, 2.5cqw, 38px);
            border-radius: clamp(6px, 1.5cqw, 10px);
            font-size: \${custom.ctaSize || 18}px;
            font-weight: 500;
            letter-spacing: 0.01em;
            transition: all 0.3s ease;
            border: 1px solid rgba(255, 255, 255, 0.2);
            \${custom.showCTA === false ? 'display: none;' : ''}
          }
          
          .\${prefix}-cta:hover {
            transform: translateY(-1px);
            background: rgba(255, 255, 255, 0.47);
            border-color: rgba(255, 255, 255, 0.3);
          }
          
          @media (prefers-color-scheme: dark) {
            .\${prefix}-item {
              background: rgba(0, 0, 0, 0.25);
              border-color: rgba(255, 255, 255, 0.18);
              box-shadow: 0 clamp(4px, 1cqw, 8px) clamp(16px, 4cqw, 32px) 0 rgba(0, 0, 0, 0.37);
            }
            
            .\${prefix}-item:hover {
              background: rgba(0, 0, 0, 0.35);
              border-color: rgba(255, 255, 255, 0.3);
              box-shadow: 0 clamp(8px, 2cqw, 15px) clamp(18px, 4.5cqw, 35px) 0 rgba(0, 0, 0, 0.5);
            }
            
            .\${prefix}-business-name {
              color: rgba(255, 255, 255, 0.95);
            }
            
            .\${prefix}-description {
              color: rgba(255, 255, 255, 0.7);
            }
            
            .\${prefix}-image-wrapper {
              background: rgba(0, 0, 0, 0.1);
              border-color: rgba(255, 255, 255, 0.1);
            }
            
            .\${prefix}-cta {
              background: rgba(255, 255, 255, 0.1);
              color: rgba(255, 255, 255, 0.9);
              border-color: rgba(255, 255, 255, 0.2);
            }
            
            .\${prefix}-cta:hover {
              background: rgba(255, 255, 255, 0.2);
              border-color: rgba(255, 255, 255, 0.3);
            }
          }
          
          .\${prefix}-empty {
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
          
          .\${prefix}-empty-title {
            font-size: clamp(13px, 3.5cqw, 18px);
            font-weight: 600;
            margin-bottom: clamp(2px, 0.5cqw, 4px);
            letter-spacing: -0.01em;
            color: #000;
          }
          
          .\${prefix}-empty-text {
            font-size: clamp(12px, 3cqw, 15px);
            font-weight: 500;
            margin-bottom: clamp(10px, 2.5cqw, 16px);
            color: #000;
          }
          
          .\${prefix}-empty-link {
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
          
          .\${prefix}-empty-link:hover {
            transform: translateY(-1px);
            background: #FF4500;
            box-shadow: 0 4px 12px rgba(255, 69, 0, 0.3);
          }
          
          @media (prefers-reduced-motion: reduce) {
            .\${prefix}-item,
            .\${prefix}-image,
            .\${prefix}-cta,
            .\${prefix}-empty,
            .\${prefix}-empty-link {
              transition: none;
            }
            
            .\${prefix}-item:hover,
            .\${prefix}-empty:hover {
              transform: none;
            }
          }
        \`;
        
        // Append custom CSS AFTER base styles with increased specificity
        if (custom.customCSS) {
          const scopedCSS = custom.customCSS
            .replace(/\\.ad-container(?!\\w)/g, '.' + prefix + '-item')
            .replace(/\\.ad-title(?!\\w)/g, '.' + prefix + '-business-name')
            .replace(/\\.ad-description(?!\\w)/g, '.' + prefix + '-description')
            .replace(/\\.ad-cta(?!\\w)/g, '.' + prefix + '-cta')
            .replace(/\\.ad-image(?!\\w)/g, '.' + prefix + '-image')
            .replace(/\\.ad-content(?!\\w)/g, '.' + prefix + '-content')
            .replace(/\\.ad-image-wrapper(?!\\w)/g, '.' + prefix + '-image-wrapper')
            .replace(/\\.ad-text-content(?!\\w)/g, '.' + prefix + '-text-content');
          
          baseStyles += '\\n\\n/* === CUSTOM CSS START === */\\n' + scopedCSS + '\\n/* === CUSTOM CSS END === */\\n';
        }
        
        return baseStyles;
      };
      
      const createPoweredBy = () => {
        const prefix = 'yepper-ad-' + _i;
        return '<div class="' + prefix + '-powered-by">Powered by <a href="https://yepper.com" target="_blank" rel="noopener noreferrer" class="' + prefix + '-powered-by-link">Yepper</a></div>';
      };
      
      const insertContainer = () => {
        const prefix = 'yepper-ad-' + _i;
        const existingContainer = d.querySelector('[data-script-id="' + _i + '"]');
        if (existingContainer) {
          return existingContainer;
        }
        
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
        container.className = prefix + '-wrapper';
        container.setAttribute('data-script-id', _i);
        
        if (scriptEl && scriptEl.parentNode) {
          scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling);
          return container;
        }
        
        console.warn('Yepper Ad: Could not find script element for insertion');
        
        const placeholder = d.querySelector('[data-yepper-ad="' + _i + '"]');
        if (placeholder) {
          placeholder.appendChild(container);
          return container;
        }
        
        d.body.appendChild(container);
        return container;
      };
      
      const showEmptyState = (container) => {
        const prefix = 'yepper-ad-' + _i;
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
          '<div class="' + prefix + '-empty">' +
            '<div class="' + prefix + '-empty-title"><h3>' + translations[currentLang].title + '</h3></div>' +
            '<div class="' + prefix + '-empty-text"><p>' + translations[currentLang].price + ' $' + _p + '</p></div>' +
            '<a href="https://www.yepper.cc/direct-ad?websiteId=' + _w + '&categoryId=' + _i + '" class="' + prefix + '-empty-link">' +
              '<span>' + translations[currentLang].action + '</span>' +
            '</a>' +
          '</div>';
      };
      
      const init = async () => {
        const prefix = 'yepper-ad-' + _i;
        const custom = await loadCustomization();
        
        let styleEl = d.getElementById('yepper-ad-styles-' + _i);
        if (!styleEl) {
          styleEl = d.createElement('style');
          styleEl.id = 'yepper-ad-styles-' + _i;
          d.head.appendChild(styleEl);
        }
        styleEl.textContent = generateStyles(custom);
        
        const container = insertContainer();
        
        fetch(_b + "/ads/display?categoryId=" + _i + "&t=" + Date.now())
          .then(response => response.json())
          .then(data => {
            if (!data || !data.html) {
              showEmptyState(container);
              return;
            }
            
            const scopedHtml = data.html
              .replace(/yepper-ad-container/g, prefix + '-container')
              .replace(/yepper-ad-item/g, prefix + '-item')
              .replace(/yepper-ad-link/g, prefix + '-link')
              .replace(/yepper-ad-content/g, prefix + '-content')
              .replace(/yepper-ad-image-wrapper/g, prefix + '-image-wrapper')
              .replace(/yepper-ad-image/g, prefix + '-image')
              .replace(/yepper-ad-text-content/g, prefix + '-text-content')
              .replace(/yepper-ad-business-name/g, prefix + '-business-name')
              .replace(/yepper-ad-description/g, prefix + '-description')
              .replace(/yepper-ad-cta/g, prefix + '-cta');
            
            container.innerHTML = createPoweredBy() + scopedHtml;
            
            const items = Array.from(container.getElementsByClassName(prefix + "-item"));
            
            if (!items.length) {
              showEmptyState(container);
              return;
            }
            
            items.forEach((e, index) => {
              if (index !== 0) e.style.display = "none";
            });
            
            items.forEach(e => {
              const link = e.querySelector('.' + prefix + '-link');
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

        // Add refresh listener
        const broadcast = new BroadcastChannel('yepper_ads');
        broadcast.onmessage = (event) => {
          if (event.data.type === 'CUSTOMIZATION_UPDATED' && event.data.categoryId === _i) {
            console.log('Reloading ad due to customization update');
            location.reload();
          }
        };
        
        window.addEventListener('message', (event) => {
          if (event.data.type === 'YEPPER_AD_REFRESH' && event.data.categoryId === _i) {
            console.log('Reloading ad due to customization update');
            location.reload();
          }
        });
      };
      
      if (d.readyState === 'loading') {
        d.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
    `;
    
    res.send(adScript);
  } catch (error) {
    console.error('Error serving ad script:', error);
    res.status(500).send('// Error serving ad script');
  }
};