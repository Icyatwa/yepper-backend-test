// AdScriptController.js
const AdCategory = require('../models/AdCategoryModel');

exports.serveAdScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const adCategory = await AdCategory.findById(scriptId);
    const categoryPrice = adCategory.price;
    const defaultLanguage = adCategory.defaultLanguage || 'english'; // Use the saved default language

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
        _b = "http://localhost:5000/api",
        _t = 5000,
        _p = ${categoryPrice}, // Include price directly in the script
        _l = "${defaultLanguage}"; // Default language from the database
    
      // Create and append styles
      const styles = \`
        .yepper-ad-wrapper {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          max-width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }
        .yepper-ad-container {
          width: 100%;
          margin: 0 auto;
          border-radius: 8px;
          overflow: hidden;
        }
        .yepper-ad-item {
          display: block;
          width: 100%;
          text-decoration: none;
          overflow: hidden;
        }
        .yepper-ad-link {
          display: block;
          color: inherit;
          text-decoration: none;
        }
        .yepper-ad-image-wrapper {
          width: 100%;
          overflow: hidden;
          position: relative;
          border-radius: 6px;
        }
        .yepper-ad-image {
          width: 100%;
          height: auto;
          display: block;
          transition: transform 0.3s ease;
        }
        .yepper-ad-text {
          
        }
        .yepper-ad-empty {
          padding: 20px;
          text-align: center;
          background-color: rgba(23, 23, 23, 0.4);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: currentColor;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          transition: all 0.5s;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }
        .yepper-ad-empty:hover {
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
        }
        .yepper-ad-empty-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 8px;
          opacity: 0.9;
          letter-spacing: 0.02em;
        }
        .yepper-ad-empty-text {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 16px;
          opacity: 0.7;
        }
        .yepper-ad-empty-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 24px;
          background: rgba(80, 80, 80, 0.25);
          color: inherit;
          text-decoration: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.05em;
          transition: all 0.3s;
          position: relative;
          overflow: hidden;
          text-transform: uppercase;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .yepper-ad-empty-link:hover {
          background: rgba(100, 100, 100, 0.35);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .yepper-lang-btn {
          cursor: pointer;
          transition: all 0.2s;
          opacity: 0.7;
        }
        .yepper-lang-btn:hover {
          opacity: 1;
        }
        .yepper-lang-btn.yepper-active {
          opacity: 1;
          font-weight: bold;
        }
        
        /* Dark mode detection and adaptations */
        @media (prefers-color-scheme: dark) {
          .yepper-ad-empty {
            background-color: rgba(30, 30, 30, 0.6);
            border-color: rgba(255, 255, 255, 0.07);
          }
          .yepper-ad-empty-link {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.1);
          }
          .yepper-ad-empty-link:hover {
            background: rgba(255, 255, 255, 0.15);
          }
        }
        
        /* Light mode detection and adaptations */
        @media (prefers-color-scheme: light) {
          .yepper-ad-empty {
            background-color: rgba(250, 250, 250, 0.7);
            border-color: rgba(0, 0, 0, 0.05);
            color: #333;
          }
          .yepper-ad-empty-link {
            background: rgba(0, 0, 0, 0.05);
            border-color: rgba(0, 0, 0, 0.08);
          }
          .yepper-ad-empty-link:hover {
            background: rgba(0, 0, 0, 0.08);
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
          '<div class="yepper-ad-empty backdrop-blur-md bg-gradient-to-b from-gray-800/30 to-gray-900/10 rounded-xl overflow-hidden border border-gray-200/20 transition-all duration-300">' +
            '<div class="yepper-ad-empty-title font-bold tracking-wide"><h3>' + translations[currentLang].title + '</h3></div>' +
            '<div class="yepper-ad-empty-text"><p>' + translations[currentLang].price + ' $' + _p + '</p></div>' +
            '<a href="http://localhost:3000/websites" class="yepper-ad-empty-link group relative overflow-hidden transition-all duration-300">' +
              '<div class="absolute inset-0 bg-gray-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>' +
              '<span class="relative z-10 uppercase tracking-wider">' + translations[currentLang].action + '</span>' +
            '</a>' +
            
            // // Language selector
            // '<div class="yepper-ad-language-selector" style="margin-top: 12px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px;">' +
            //   Object.keys(translations).map(lang => 
            //     '<button class="yepper-lang-btn' + (lang === currentLang ? ' yepper-active' : '') + '" ' +
            //     'data-lang="' + lang + '" ' +
            //     'style="font-size: 10px; padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); ' +
            //     'background: ' + (lang === currentLang ? 'rgba(255,255,255,0.2)' : 'transparent') + ';">' +
            //     lang.charAt(0).toUpperCase() + lang.slice(1) +
            //     '</button>'
            //   ).join('') +
            // '</div>' +
          '</div>';
        
        // Add event listeners to language buttons
        const langButtons = container.querySelectorAll('.yepper-lang-btn');
        langButtons.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const selectedLang = e.target.dataset.lang;
            
            // Update title, price and action button
            container.querySelector('.yepper-ad-empty-title h3').textContent = translations[selectedLang].title;
            container.querySelector('.yepper-ad-empty-text p').textContent = translations[selectedLang].price + ' $' + _p;
            container.querySelector('.yepper-ad-empty-link span').textContent = translations[selectedLang].action;
            
            // Update active button styling
            langButtons.forEach(b => {
              b.style.background = 'transparent';
              b.classList.remove('yepper-active');
            });
            e.target.style.background = 'rgba(255,255,255,0.2)';
            e.target.classList.add('yepper-active');
          });
        });
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