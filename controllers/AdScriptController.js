// AdScriptController.js
const AdCategory = require('../models/AdCategoryModel');

// Updated AdScriptController.js

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
    
    // Set proper content type and cache headers
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Generate the complete ad script with modal functionality
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
    
      // Create and append styles with modal styles
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
          cursor: pointer;
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
          margin-top: 8px;
          font-weight: 500;
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
        
        /* Modal styles */
        .yepper-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s, visibility 0.3s;
        }
        .yepper-modal-overlay.active {
          opacity: 1;
          visibility: visible;
        }
        .yepper-modal {
          width: 90%;
          max-width: 600px;
          background-color: #fff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.15);
          transform: translateY(20px);
          transition: transform 0.4s;
          display: flex;
          flex-direction: column;
          max-height: 85vh;
        }
        .yepper-modal-overlay.active .yepper-modal {
          transform: translateY(0);
        }
        .yepper-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        .yepper-modal-title {
          font-size: 20px;
          font-weight: bold;
          margin: 0;
        }
        .yepper-modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #888;
          transition: color 0.2s;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }
        .yepper-modal-close:hover {
          color: #333;
          background-color: rgba(0, 0, 0, 0.05);
        }
        .yepper-modal-body {
          padding: 20px;
          overflow-y: auto;
        }
        .yepper-modal-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .yepper-modal-image {
          width: 100%;
          border-radius: 8px;
          overflow: hidden;
        }
        .yepper-modal-image img {
          width: 100%;
          height: auto;
          display: block;
        }
        .yepper-modal-info {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        .yepper-modal-business-name {
          font-size: 22px;
          font-weight: bold;
          margin: 0;
        }
        .yepper-modal-business-description {
          font-size: 16px;
          line-height: 1.5;
          color: #444;
          margin: 0;
        }
        .yepper-modal-business-location {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: #666;
        }
        .yepper-modal-location-icon {
          width: 16px;
          height: 16px;
        }
        .yepper-modal-footer {
          padding: 15px 20px;
          display: flex;
          justify-content: flex-end;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
        }
        .yepper-modal-visit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 24px;
          background-color: #2563eb;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
        }
        .yepper-modal-visit:hover {
          background-color: #1d4ed8;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
        }
        
        /* Video section */
        .yepper-modal-video {
          width: 100%;
          overflow: hidden;
          border-radius: 8px;
          aspect-ratio: 16/9;
        }
        .yepper-modal-video video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        /* PDF preview */
        .yepper-modal-pdf {
          width: 100%;
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .yepper-modal-pdf-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 15px;
          background-color: rgba(0, 0, 0, 0.05);
          border-radius: 6px;
          color: #2563eb;
          text-decoration: none;
          font-weight: 500;
          transition: background-color 0.2s;
        }
        .yepper-modal-pdf-link:hover {
          background-color: rgba(0, 0, 0, 0.08);
        }
        
        /* Dark mode adaptations for modal */
        @media (prefers-color-scheme: dark) {
          .yepper-modal {
            background-color: #1f2937;
            color: #e5e7eb;
          }
          .yepper-modal-header {
            border-bottom-color: rgba(255, 255, 255, 0.1);
          }
          .yepper-modal-close {
            color: #9ca3af;
          }
          .yepper-modal-close:hover {
            color: #e5e7eb;
            background-color: rgba(255, 255, 255, 0.1);
          }
          .yepper-modal-business-description {
            color: #d1d5db;
          }
          .yepper-modal-business-location {
            color: #9ca3af;
          }
          .yepper-modal-footer {
            border-top-color: rgba(255, 255, 255, 0.1);
          }
          .yepper-modal-pdf-link {
            background-color: rgba(255, 255, 255, 0.1);
            color: #60a5fa;
          }
          .yepper-modal-pdf-link:hover {
            background-color: rgba(255, 255, 255, 0.15);
          }
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
      
      // Create modal container once
      const createModal = () => {
        // Remove existing modal if any
        const existingModal = d.getElementById('yepper-modal-overlay');
        if (existingModal) {
          existingModal.remove();
        }
        
        // Create overlay
        const overlay = d.createElement('div');
        overlay.id = 'yepper-modal-overlay';
        overlay.className = 'yepper-modal-overlay';
        
        // Create modal
        const modal = d.createElement('div');
        modal.className = 'yepper-modal';
        
        // Modal header
        const header = d.createElement('div');
        header.className = 'yepper-modal-header';
        
        const title = d.createElement('h3');
        title.className = 'yepper-modal-title';
        title.textContent = 'Advertisement';
        
        const closeBtn = d.createElement('button');
        closeBtn.className = 'yepper-modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => {
          overlay.classList.remove('active');
          setTimeout(() => {
            overlay.remove();
          }, 300);
        };
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        // Modal body
        const body = d.createElement('div');
        body.className = 'yepper-modal-body';
        
        const content = d.createElement('div');
        content.className = 'yepper-modal-content';
        body.appendChild(content);
        
        // Modal footer
        const footer = d.createElement('div');
        footer.className = 'yepper-modal-footer';
        
        const visitBtn = d.createElement('a');
        visitBtn.className = 'yepper-modal-visit';
        visitBtn.textContent = 'Visit Website';
        visitBtn.target = '_blank';
        footer.appendChild(visitBtn);
        
        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        
        overlay.appendChild(modal);
        d.body.appendChild(overlay);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            overlay.classList.remove('active');
            setTimeout(() => {
              overlay.remove();
            }, 300);
          }
        });
        
        // Close on escape key
        d.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && overlay.classList.contains('active')) {
            overlay.classList.remove('active');
            setTimeout(() => {
              overlay.remove();
            }, 300);
          }
        });
        
        return { overlay, content, visitBtn };
      };
      
      // Show modal with ad details
      const showAdModal = async (adId) => {
        try {
          // Create the modal
          const { overlay, content, visitBtn } = createModal();
          
          // Fetch ad details
          const response = await fetch(_b + "/ads/details/" + adId);
          const adData = await response.json();
          
          if (!adData || !adData.ad) {
            content.innerHTML = '<p>Ad information could not be loaded.</p>';
            visitBtn.style.display = 'none';
            overlay.classList.add('active');
            return;
          }
          
          const ad = adData.ad;
          
          // Set the target URL
          const targetUrl = ad.businessLink.startsWith('http') ? 
            ad.businessLink : 'https://' + ad.businessLink;
          visitBtn.href = targetUrl;
          
          // Build content HTML
          let contentHTML = '';
          
          // Image section
          if (ad.imageUrl) {
            contentHTML += \`
              <div class="yepper-modal-image">
                <img src="\${ad.imageUrl}" alt="\${ad.businessName}" loading="lazy">
              </div>
            \`;
          }
          
          // Video section
          if (ad.videoUrl) {
            contentHTML += \`
              <div class="yepper-modal-video">
                <video controls>
                  <source src="\${ad.videoUrl}" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
              </div>
            \`;
          }
          
          // PDF section
          if (ad.pdfUrl) {
            contentHTML += \`
              <div class="yepper-modal-pdf">
                <a href="\${ad.pdfUrl}" target="_blank" class="yepper-modal-pdf-link">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  View PDF Brochure
                </a>
              </div>
            \`;
          }
          
          // Info section
          contentHTML += \`
            <div class="yepper-modal-info">
              <h2 class="yepper-modal-business-name">\${ad.businessName}</h2>
              <p class="yepper-modal-business-description">\${ad.adDescription}</p>
              <div class="yepper-modal-business-location">
                <svg class="yepper-modal-location-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                \${ad.businessLocation}
              </div>
            </div>
          \`;
          
          // Set content and show modal
          content.innerHTML = contentHTML;
          overlay.classList.add('active');
          
          // Track modal view
          fetch(_b + "/ads/modalView/" + adId, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit'
          }).catch(console.error);
          
        } catch (error) {
          console.error("Error showing ad modal:", error);
        }
      };
      
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
            '<a href="http://localhost:3000/direct-ad?websiteId=' + _w + '&categoryId=' + _i + '" class="yepper-ad-empty-link group relative overflow-hidden transition-all duration-300">' +
              '<div class="absolute inset-0 bg-gray-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>' +
              '<span class="relative z-10 uppercase tracking-wider">' + translations[currentLang].action + '</span>' +
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
            
            const adId = e.dataset.adId;
            
            // Track view for visible ad
            if (e.style.display !== "none") {
              fetch(_b + "/ads/view/" + adId, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              }).catch(console.error);
            }
            
            // Handle click - show modal instead of redirect
            link.onclick = ev => {
              ev.preventDefault();
              
              // Track the click
              fetch(_b + "/ads/click/" + adId, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              }).catch(console.error);
              
              // Show the modal with ad details
              showAdModal(adId);
              
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
              const adId = items[x].dataset.adId;
              if (adId) {
                fetch(_b + "/ads/view/" + adId, {
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