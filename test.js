// 1. First, let's modify the AdScriptController.js to update the "advertise here" link

exports.serveAdScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const adCategory = await AdCategory.findById(scriptId);
    const categoryPrice = adCategory.price;
    const defaultLanguage = adCategory.defaultLanguage || 'english';
    const websiteId = adCategory.websiteId; // Get the website ID
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Generate the complete ad script with all functionality
    const adScript = `
    (function() {
      const d = document,
        _i = "${scriptId}",
        _w = "${websiteId}", // Include websiteId for the direct link
        _b = "http://localhost:5000/api",
        _t = 5000,
        _p = ${categoryPrice},
        _l = "${defaultLanguage}";
    
      const styles = \`
        // css
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
          // languages
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
        
        // Create HTML for the empty state - Update the link to include website and category IDs
        container.innerHTML = 
          '<div class="yepper-ad-empty backdrop-blur-md bg-gradient-to-b from-gray-800/30 to-gray-900/10 rounded-xl overflow-hidden border border-gray-200/20 transition-all duration-300">' +
            '<div class="yepper-ad-empty-title font-bold tracking-wide"><h3>' + translations[currentLang].title + '</h3></div>' +
            '<div class="yepper-ad-empty-text"><p>' + translations[currentLang].price + ' $' + _p + '</p></div>' +
            '<a href="http://localhost:3000/advertise?websiteId=' + _w + '&categoryId=' + _i + '" class="yepper-ad-empty-link group relative overflow-hidden transition-all duration-300">' +
              '<div class="absolute inset-0 bg-gray-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>' +
              '<span class="relative z-10 uppercase tracking-wider">' + translations[currentLang].action + '</span>' +
            '</a>' +
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
  }
};

// 2. Create a new route to handle direct advertising links
// routes/advertiseRoutes.js

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  // This will render the advertise page
  res.redirect(`/websites?preselect=true&websiteId=${req.query.websiteId}&categoryId=${req.query.categoryId}`);
});

module.exports = router;

// 3. Update the Websites.js component to handle preselection

function Websites() {
  const location = useLocation();
  const { user } = useUser();
  const navigate = useNavigate();
  const userId = user?.id;
  const [websites, setWebsites] = useState([]);
  const [filteredWebsites, setFilteredWebsites] = useState([]);
  const [selectedWebsites, setSelectedWebsites] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Get query parameters
  const queryParams = new URLSearchParams(location.search);
  const preselect = queryParams.get('preselect') === 'true';
  const preselectedWebsiteId = queryParams.get('websiteId');
  const preselectedCategoryId = queryParams.get('categoryId');

  useEffect(() => {
    const fetchWebsites = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5000/api/websites');
        const data = await response.json();
        
        setWebsites(data);
        setFilteredWebsites(data);
        const uniqueCategories = ['All', ...new Set(data.map(site => site.category))];
        setCategories(uniqueCategories);
        
        // If preselection is requested, automatically select the website
        if (preselect && preselectedWebsiteId) {
          setSelectedWebsites([preselectedWebsiteId]);
          
          // If there's preselection, automatically go to the next step
          if (user && user.id) {
            // Short delay to ensure state is updated
            setTimeout(() => {
              navigate('/categories', {
                state: {
                  userId: user.id,
                  selectedWebsites: [preselectedWebsiteId],
                  preselectedCategoryId: preselectedCategoryId
                }
              });
            }, 500);
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching websites:', error);
        setError('Failed to load websites');
        setLoading(false);
      }
    };

    fetchWebsites();
  }, [preselect, preselectedWebsiteId, preselectedCategoryId, user, navigate]);

  useEffect(() => {
    let result = websites;
    
    if (searchTerm) {
      result = result.filter(site => 
        site.websiteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        site.websiteLink.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedCategory !== 'All') {
      result = result.filter(site => site.category === selectedCategory);
    }
    
    setFilteredWebsites(result);
  }, [searchTerm, selectedCategory, websites]);

  const handleNext = (e) => {
    e.preventDefault();
    navigate('/categories', {
      state: {
        userId,
        selectedWebsites,
        preselectedCategoryId: preselectedCategoryId
      }
    });
  };

  return (
    // Rest of the component remains the same
  );
}

// 4. Update the Categories.js component to handle preselection

const Categories = () => {
  const { user } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, selectedWebsites, preselectedCategoryId } = location.state || {};
  const [categoriesByWebsite, setCategoriesByWebsite] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedDescription, setSelectedDescription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const promises = selectedWebsites.map(async (websiteId) => {
          const websiteResponse = await fetch(`http://localhost:5000/api/websites/website/${websiteId}`);
          const websiteData = await websiteResponse.json();
          const categoriesResponse = await fetch(`http://localhost:5000/api/ad-categories/${websiteId}/advertiser`);
          const categoriesData = await categoriesResponse.json();

          return {
            websiteName: websiteData.websiteName || 'Unknown Website',
            websiteLink: websiteData.websiteLink || '#',
            categories: categoriesData.categories || [],
          };
        });
        const result = await Promise.all(promises);
        setCategoriesByWebsite(result);
        
        // If there's a preselected category, select it automatically
        if (preselectedCategoryId) {
          setSelectedCategories([preselectedCategoryId]);
          
          // Get category description for display
          for (const websiteData of result) {
            const foundCategory = websiteData.categories.find(
              cat => cat._id === preselectedCategoryId
            );
            
            if (foundCategory) {
              setSelectedDescription(foundCategory.description);
              
              // If preselection is complete, automatically navigate to the next step
              setTimeout(() => {
                navigate('/select', {
                  state: {
                    userId,
                    selectedWebsites,
                    selectedCategories: [preselectedCategoryId]
                  }
                });
              }, 500);
              
              break;
            }
          }
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching categories:', error);
        setIsLoading(false);
      }
    };

    if (selectedWebsites && selectedWebsites.length > 0) {
      fetchCategories();
    } else {
      setIsLoading(false);
    }
  }, [selectedWebsites, preselectedCategoryId, userId, navigate]);

  const handleNext = (e) => {
    e.preventDefault();
    navigate('/select', {
      state: {
        userId,
        selectedWebsites,
        selectedCategories
      }
    });
  };
  
  return (
    // Rest of the component remains the same
  );
};

// 5. Update main App.js to include the new route
// App.js

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/advertise" element={<RequireAuth><Websites /></RequireAuth>} />
        <Route path="/websites" element={<RequireAuth><Websites /></RequireAuth>} />
        <Route path="/categories" element={<RequireAuth><Categories /></RequireAuth>} />
        <Route path="/select" element={<RequireAuth><Select /></RequireAuth>} />
        <Route path="/business" element={<RequireAuth><BusinessForm /></RequireAuth>} />
        {/* Other routes */}
      </Routes>
    </BrowserRouter>
  );
}