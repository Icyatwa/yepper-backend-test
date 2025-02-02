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
          _b="http://localhost:5000/api",
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
            <a href="http://localhost:3000/select" class="yepper-ad-empty-link">Advertise Here</a>
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

exports.createCategory = async (req, res) => {
  try {
    const { 
      ownerId, 
      websiteId, 
      categoryName, 
      description, 
      price, 
      customAttributes,
      spaceType,
      userCount,
      instructions,
      webOwnerEmail,
      visitorRange,
      tier
    } = req.body;

    if (!ownerId || !websiteId || !categoryName || !price || !spaceType || !webOwnerEmail || !visitorRange || !tier) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newCategory = new AdCategory({
      ownerId,
      websiteId,
      categoryName,
      description,
      price,
      spaceType,
      userCount: userCount || 0,
      instructions,
      customAttributes: customAttributes || {},
      webOwnerEmail,
      selectedAds: [],
      visitorRange,
      tier
    });

    const savedCategory = await newCategory.save();
    const { script } = generateSecureScript(savedCategory._id.toString());

    savedCategory.apiCodes = {
      HTML: `<script>\n${script}\n</script>`,
      JavaScript: `const script = document.createElement('script');\nscript.textContent = \`${script}\`;\ndocument.body.appendChild(script);`,
      PHP: `<?php echo '<script>\n${script}\n</script>'; ?>`,
      Python: `print('<script>\n${script}\n</script>')`
    };

    const finalCategory = await savedCategory.save();
    res.status(201).json(finalCategory);
    
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ 
      message: 'Failed to create category', 
      error: error.message 
    });
  }
};

exports.getCategories = async (req, res) => {
  const { ownerId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ ownerId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ ownerId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
  }
};

exports.getCategoriesByWebsite = async (req, res) => {
  const { websiteId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ websiteId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ websiteId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
  }
};

exports.getCategoryById = async (req, res) => {
  const { categoryId } = req.params;

  try {
    const category = await AdCategory.findById(categoryId);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch category', error });
  }
};