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
    
    // Verify this is a valid category ID and get the price immediately
    if (!adCategory) {
      return res.status(404).send('// Script not found');
    }
    
    // Set proper content type and cache headers
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Generate the complete ad script with all functionality
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
    
      // Create and append styles
      const styles = \`
        .yepper-ad-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          max-width: 100%;
          overflow: hidden;
          box-sizing: border-box;
          margin: 20px 0;
          line-height: 1.4;
        }
        .yepper-ad-container {
          width: 100%;
          margin: 0 auto;
          border-radius: 8px;
          overflow: hidden;
        }
        
        /* Glass Morphism Ad Design */
        .yepper-ad-item {
          display: block;
          width: 100%;
          text-decoration: none;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 16px;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          color: inherit;
        }
        
        .yepper-ad-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 35px 0 rgba(31, 38, 135, 0.4);
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.35);
        }
        
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
          padding: 8px 16px;
          font-size: 11px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 32px;
          letter-spacing: 0.01em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .yepper-ad-header-logo {
          font-weight: 600;
          font-size: 11px;
          opacity: 0.7;
        }
        
        .yepper-ad-header-badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 9px;
          font-weight: 500;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .yepper-ad-content {
          padding: 18px;
          background: transparent;
        }
        
        .yepper-ad-image-wrapper {
          width: 100%;
          overflow: hidden;
          position: relative;
          border-radius: 12px;
          margin-bottom: 16px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(5px);
          min-height: 140px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .yepper-ad-image {
          width: 100%;
          height: auto;
          min-height: 140px;
          max-height: 180px;
          object-fit: cover;
          display: block;
          transition: transform 0.3s ease;
          border-radius: 11px;
        }
        
        .yepper-ad-item:hover .yepper-ad-image {
          transform: scale(1.02);
        }
        
        .yepper-ad-business-name {
          font-size: 16px;
          font-weight: 600;
          color: rgba(0, 0, 0, 0.9);
          margin: 0 0 10px 0;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          letter-spacing: -0.01em;
        }
        
        .yepper-ad-description {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.6);
          line-height: 1.5;
          margin: 0 0 16px 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        .yepper-ad-cta {
          display: inline-flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: rgba(0, 0, 0, 0.8);
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.2);
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
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          color: rgba(0, 0, 0, 0.5);
          min-height: 28px;
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
          max-width: 140px;
          color: rgba(0, 0, 0, 0.3);
        }
        
        /* Dark theme adaptation */
        @media (prefers-color-scheme: dark) {
          .yepper-ad-item {
            background: rgba(0, 0, 0, 0.25);
            border-color: rgba(255, 255, 255, 0.18);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
          }
          
          .yepper-ad-item:hover {
            background: rgba(0, 0, 0, 0.35);
            border-color: rgba(255, 255, 255, 0.3);
            box-shadow: 0 15px 35px 0 rgba(0, 0, 0, 0.5);
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
        
        /* High contrast theme */
        @media (prefers-contrast: high) {
          .yepper-ad-item {
            border-width: 2px;
            border-color: #000;
          }
          
          .yepper-ad-business-name {
            color: #000;
            font-weight: 700;
          }
          
          .yepper-ad-description {
            color: #333;
          }
          
          .yepper-ad-cta {
            background: #0066cc;
            border: 2px solid #004499;
          }
        }
        
        /* Responsive design */
        @media (max-width: 768px) {
          .yepper-ad-wrapper {
            margin: 16px 0;
          }
          
          .yepper-ad-content {
            padding: 14px;
          }
          
          .yepper-ad-business-name {
            font-size: 15px;
          }
          
          .yepper-ad-description {
            font-size: 12px;
          }
          
          .yepper-ad-header {
            padding: 5px 12px;
            font-size: 10px;
            min-height: 26px;
          }
          
          .yepper-ad-header-logo {
            font-size: 10px;
          }
          
          .yepper-ad-header-badge {
            font-size: 8px;
            padding: 2px 6px;
          }
          
          .yepper-ad-footer {
            padding: 6px 12px;
            font-size: 9px;
            min-height: 22px;
          }
          
          .yepper-ad-cta {
            padding: 7px 14px;
            font-size: 11px;
          }
          
          .yepper-ad-image {
            min-height: 120px;
            max-height: 150px;
          }
        }
        
        @media (max-width: 480px) {
          .yepper-ad-image {
            min-height: 100px;
            max-height: 130px;
          }
          
          .yepper-ad-business-name {
            font-size: 14px;
          }
          
          .yepper-ad-description {
            font-size: 11px;
          }
          
          .yepper-ad-header {
            padding: 4px 10px;
            font-size: 9px;
            min-height: 24px;
          }
          
          .yepper-ad-header-logo {
            font-size: 9px;
          }
          
          .yepper-ad-header-badge {
            font-size: 7px;
            padding: 1px 5px;
          }
          
          .yepper-ad-footer {
            padding: 5px 10px;
            font-size: 8px;
            min-height: 20px;
          }
          
          .yepper-ad-footer-business {
            max-width: 100px;
          }
        }
        
        @media (max-width: 320px) {
          .yepper-ad-wrapper {
            margin: 12px 0;
          }
          
          .yepper-ad-content {
            padding: 12px;
          }
          
          .yepper-ad-image {
            min-height: 80px;
            max-height: 110px;
          }
          
          .yepper-ad-business-name {
            font-size: 13px;
            -webkit-line-clamp: 1;
          }
          
          .yepper-ad-description {
            font-size: 10px;
            -webkit-line-clamp: 1;
          }
          
          .yepper-ad-header {
            padding: 3px 8px;
            font-size: 8px;
            min-height: 20px;
          }
          
          .yepper-ad-header-logo {
            font-size: 8px;
          }
          
          .yepper-ad-header-badge {
            display: none;
          }
          
          .yepper-ad-footer {
            padding: 4px 8px;
            font-size: 7px;
            min-height: 18px;
          }
          
          .yepper-ad-footer-business {
            max-width: 80px;
          }
          
          .yepper-ad-cta {
            padding: 6px 12px;
            font-size: 10px;
          }
        }
        
        /* Enhanced Empty State with Adaptive Colors */
        .yepper-ad-empty {
          padding: 24px 20px;
          text-align: center;
          background: linear-gradient(135deg, rgba(79, 172, 254, 0.08) 0%, rgba(0, 242, 254, 0.08) 100%);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 12px;
          border: 1px solid rgba(79, 172, 254, 0.2);
          color: currentColor;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(79, 172, 254, 0.1);
          position: relative;
          overflow: hidden;
        }
        
        .yepper-ad-empty::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transition: left 0.5s ease;
        }
        
        .yepper-ad-empty:hover::before {
          left: 100%;
        }
        
        .yepper-ad-empty:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(79, 172, 254, 0.15);
          border-color: rgba(79, 172, 254, 0.3);
        }
        
        .yepper-ad-empty-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 4px;
          opacity: 0.9;
          letter-spacing: -0.01em;
          color: #2d3748;
        }
        
        .yepper-ad-empty-text {
          font-size: 15px;
          font-weight: 500;
          margin-bottom: 16px;
          opacity: 0.7;
          color: #4a5568;
        }
        
        .yepper-ad-empty-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 24px;
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          border: none;
          box-shadow: 0 2px 8px rgba(79, 172, 254, 0.3);
        }
        
        .yepper-ad-empty-link:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(79, 172, 254, 0.4);
          background: linear-gradient(135deg, #4facfe 0%, #00d4fe 100%);
        }
        
        /* Dark mode for empty state */
        @media (prefers-color-scheme: dark) {
          .yepper-ad-empty {
            background: linear-gradient(135deg, rgba(76, 81, 191, 0.15) 0%, rgba(85, 60, 154, 0.15) 100%);
            border-color: rgba(124, 58, 237, 0.3);
            box-shadow: 0 2px 8px rgba(124, 58, 237, 0.2);
          }
          
          .yepper-ad-empty:hover {
            border-color: rgba(124, 58, 237, 0.4);
            box-shadow: 0 8px 25px rgba(124, 58, 237, 0.25);
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
        
        /* Reduced motion preferences */
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
          
          .yepper-ad-empty::before {
            display: none;
          }
        }
      \`;
      
      const styleEl = d.createElement('style');
      styleEl.textContent = styles;
      d.head.appendChild(styleEl);
      
      // Function to insert container after the current script
      const insertContainer = () => {
        // Get the current script
        let scriptEl = d.currentScript;
        
        // Fallback for browsers that don't support currentScript
        if (!scriptEl) {
          const scripts = d.getElementsByTagName('script');
          for (let i = scripts.length - 1; i >= 0; i--) {
            if (scripts[i].src && scripts[i].src.includes('/api/ads/script/' + _i)) {
              scriptEl = scripts[i];
              break;
            }
          }
        }
        
        // Create container
        const container = d.createElement('div');
        container.className = 'yepper-ad-wrapper';
        container.setAttribute('data-script-id', _i);
        
        // Insert after script
        if (scriptEl && scriptEl.parentNode) {
          scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling);
          return container;
        }
        
        // Fallback: Append to body
        d.body.appendChild(container);
        return container;
      };
      
      // Function to show empty state with multiple languages
      const showEmptyState = (container) => {
        // Define translations
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
        
        // Use the default language from the database first
        let currentLang = _l;
        
        // If browser detection is still desired as a fallback (when _l is not valid)
        if (!translations[currentLang]) {
          // Language detection (simplified version)
          let userLang = navigator.language || navigator.userLanguage;
          userLang = userLang.toLowerCase().split('-')[0];
          
          // Map browser language to our translations
          currentLang = 'english'; // Default fallback
          if (userLang === 'fr') currentLang = 'french';
          if (userLang === 'rw') currentLang = 'kinyarwanda';
          if (userLang === 'sw') currentLang = 'kiswahili';
          if (userLang === 'zh') currentLang = 'chinese';
          if (userLang === 'es') currentLang = 'spanish';
        }
        
        // Create HTML for the empty state
        container.innerHTML = 
          '<div class="yepper-ad-empty">' +
            '<div class="yepper-ad-empty-title"><h3>' + translations[currentLang].title + '</h3></div>' +
            '<div class="yepper-ad-empty-text"><p>' + translations[currentLang].price + ' $' + _p + '</p></div>' +
            '<a href="http://localhost:3000/direct-ad?websiteId=' + _w + '&categoryId=' + _i + '" class="yepper-ad-empty-link">' +
              '<span>' + translations[currentLang].action + '</span>' +
            '</a>' +
          '</div>';
      };
      
      // Insert container for ads
      const container = insertContainer();
      
      // Fetch ads
      fetch(_b + "/ads/display?categoryId=" + _i)
        .then(response => response.json())
        .then(data => {
          if (!data || !data.html) {
            showEmptyState(container);
            return;
          }
          container.innerHTML = data.html;
          const items = Array.from(container.getElementsByClassName("yepper-ad-item"));
          
          if (!items.length) {
            showEmptyState(container);
            return;
          }
          
          // Hide all items except first
          items.forEach((e, index) => {
            if (index !== 0) e.style.display = "none";
          });
          
          // Track views and handle clicks
          items.forEach(e => {
            const link = e.querySelector('.yepper-ad-link');
            if (!link) return;
            
            const i = e.dataset.adId;
            
            // Track view for visible ad
            if (e.style.display !== "none") {
              fetch(_b + "/ads/view/" + i, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              }).catch(console.error);
            }
            
            // Handle click
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
          
          // Rotate ads if multiple
          if (items.length > 1) {
            let x = 0;
            setInterval(() => {
              items[x].style.display = "none";
              x = (x + 1) % items.length;
              items[x].style.display = "block";
              
              // Track view for newly visible ad
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