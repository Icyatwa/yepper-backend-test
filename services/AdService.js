// AdService.js
const crypto = require('crypto');

class AdService {
  static generateNonce() {
    return crypto.randomBytes(16).toString('hex');
  }

  static encryptScript(script) {
    return Buffer.from(script).toString('base64');
  }

  static generateScript(categoryId, config) {
    const nonce = this.generateNonce();
    const baseScript = `
      (function() {
        const CONFIG = {
          categoryId: "${categoryId}",
          baseUrl: "${config.baseUrl}",
          containerId: "ad-${nonce}",
          rotationInterval: ${config.rotationInterval || 5000}
        };

        class AdManager {
          constructor(config) {
            this.config = config;
            this.currentAdIndex = 0;
            this.ads = [];
          }

          init() {
            this.createContainer();
            this.loadAds();
          }

          createContainer() {
            const container = document.createElement('div');
            container.id = this.config.containerId;
            container.style.width = '100%';
            container.style.minHeight = '100px';
            
            const script = document.currentScript || (() => {
              const scripts = document.getElementsByTagName('script');
              return Array.from(scripts).find(s => 
                s.textContent.includes(this.config.categoryId)
              );
            })();

            if (script && script.parentNode) {
              script.parentNode.insertBefore(container, script);
            } else {
              document.body.appendChild(container);
            }

            this.container = container;
            this.showLoading();
          }

          showLoading() {
            this.container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading ads...</div>';
          }

          showError(message) {
            this.container.innerHTML = \`<div style="text-align: center; padding: 20px; color: #666;">
              \${message || 'Error loading ads'}
            </div>\`;
          }

          async loadAds() {
            try {
              const response = await fetch(\`\${this.config.baseUrl}/api/ads/display?categoryId=\${this.config.categoryId}\`);
              if (!response.ok) throw new Error('Failed to fetch ads');
              
              const data = await response.json();
              if (data.error) throw new Error(data.error);
              
              this.ads = data.ads;
              if (!this.ads.length) {
                this.showError('No ads available');
                return;
              }

              this.renderAds();
              this.startRotation();
              this.trackView(this.ads[0].id);
            } catch (error) {
              console.error('Ad loading error:', error);
              this.showError(error.message);
            }
          }

          renderAds() {
            this.container.innerHTML = this.ads.map((ad, index) => \`
              <div class="ad-container" style="display: \${index === 0 ? 'block' : 'none'}; padding: 10px; margin: 10px 0;">
                <a href="\${ad.link}" class="ad" data-ad-id="\${ad.id}" 
                   onclick="return false;" style="text-decoration: none; color: inherit;">
                  \${ad.imageUrl ? \`<img src="\${ad.imageUrl}" alt="\${ad.businessName}" 
                     style="max-width: 100%; height: auto;">\` : ''}
                  <p style="margin: 5px 0;">Sponsored by \${ad.businessName}</p>
                </a>
              </div>
            \`).join('');

            this.attachClickHandlers();
          }

          attachClickHandlers() {
            this.container.querySelectorAll('.ad').forEach(ad => {
              ad.addEventListener('click', async (e) => {
                e.preventDefault();
                const adId = ad.dataset.adId;
                const href = ad.href;
                
                try {
                  await this.trackClick(adId);
                } finally {
                  window.open(href, '_blank');
                }
              });
            });
          }

          startRotation() {
            if (this.ads.length <= 1) return;
            
            setInterval(() => {
              const containers = this.container.getElementsByClassName('ad-container');
              containers[this.currentAdIndex].style.display = 'none';
              
              this.currentAdIndex = (this.currentAdIndex + 1) % this.ads.length;
              containers[this.currentAdIndex].style.display = 'block';
              
              this.trackView(this.ads[this.currentAdIndex].id);
            }, this.config.rotationInterval);
          }

          async trackView(adId) {
            try {
              await fetch(\`\${this.config.baseUrl}/api/ads/view/\${adId}\`, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              });
            } catch (error) {
              console.error('View tracking error:', error);
            }
          }

          async trackClick(adId) {
            try {
              await fetch(\`\${this.config.baseUrl}/api/ads/click/\${adId}\`, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit'
              });
            } catch (error) {
              console.error('Click tracking error:', error);
            }
          }
        }

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => new AdManager(CONFIG).init());
        } else {
          new AdManager(CONFIG).init();
        }
      })();
    `;

    return this.encryptScript(baseScript);
  }
}

module.exports = AdService;