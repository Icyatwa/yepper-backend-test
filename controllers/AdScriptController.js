// AdScriptController.js
const AdCategory = require('../models/AdCategoryModel');

// This endpoint serves the actual implementation of the ad script
exports.serveAdScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    
    // Verify this is a valid category ID
    const adCategory = await AdCategory.findById(scriptId);
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
            _t = 5000;
      
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
          margin: 8px 0;
          font-size: 14px;
          color: #333;
          text-align: center;
        }
        .yepper-ad-empty {
          padding: 20px;
          text-align: center;
          background-color: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e9ecef;
        }
        .yepper-ad-empty-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 8px;
          color: #495057;
        }
        .yepper-ad-empty-text {
          font-size: 14px;
          margin-bottom: 16px;
          color: #6c757d;
        }
        .yepper-ad-empty-link {
          display: inline-block;
          padding: 8px 16px;
          background-color: #007bff;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-size: 14px;
          transition: background-color 0.2s;
        }
        .yepper-ad-empty-link:hover {
          background-color: #0069d9;
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
      
      // Function to show empty state
      const showEmptyState = (container) => {
        container.innerHTML = \`
          <div class="yepper-ad-empty">
            <div class="yepper-ad-empty-title">Available Space for Advertising</div>
            <div class="yepper-ad-empty-text">Premium spot for your business advertisement</div>
            <a href="http://localhost:3000/select" class="yepper-ad-empty-link">Advertise Here</a>
          </div>
        \`;
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