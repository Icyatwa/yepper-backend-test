// SiteScriptController.js
// Serves ONE script per website that handles ALL ad spaces —
// auto-placed and manual-placed — from a single <script> tag.

const AdCategory = require('../models/CreateCategoryModel');
const Website    = require('../models/CreateWebsiteModel');

// Neutral wrapper aliases for ad-blocker evasion
const WRAPPERS = [
  'content-widget','page-module','site-section','layout-block',
  'view-unit','frame-item','display-zone','content-box',
  'media-section','page-element','render-block','ui-widget',
];

function neutralClass(id) {
  return WRAPPERS[parseInt(id.slice(-2), 16) % WRAPPERS.length];
}

// Auto-spacetypes that work without semantic HTML
const AUTO_RELIABLE = [
  'header','floating','overlay','modalpic','mobile interstitial',
  'bottom','profooter',
];

// CSS per spaceType (scoped to each category prefix)
function placementCSS(spaceType, px) {
  const base = `.${px}-host{display:block;width:100%;box-sizing:border-box;position:relative;overflow:visible;}`;
  const map = {
    'header':              `.${px}-host{width:100%;top:0;left:0;z-index:900;max-height:120px;}`,
    'above the fold':      `.${px}-host{width:100%;margin:0 0 16px 0;}`,
    'beneath title':       `.${px}-host{width:100%;margin:12px 0 20px 0;}`,
    'in feed':             `.${px}-host{width:100%;margin:16px 0;border-radius:12px;overflow:hidden;}`,
    'inline content':      `.${px}-host{float:right;width:300px;margin:0 0 12px 20px;}@media(max-width:600px){.${px}-host{float:none;width:100%;margin:12px 0;}}`,
    'sidebar':             `.${px}-host{width:100%;margin:0 0 16px 0;max-width:300px;}`,
    'left rail':           `.${px}-host{width:160px;position:sticky;top:80px;margin-right:16px;}@media(max-width:768px){.${px}-host{width:100%;position:static;}}`,
    'rightrail':           `.${px}-host{width:160px;position:sticky;top:80px;margin-left:16px;}@media(max-width:768px){.${px}-host{width:100%;position:static;}}`,
    'stickysidebar':       `.${px}-host{position:sticky;top:80px;width:100%;max-width:300px;z-index:100;}`,
    'floating':            `.${px}-host{position:fixed;bottom:24px;right:24px;width:320px;z-index:9999;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.18));}@media(max-width:480px){.${px}-host{width:calc(100% - 32px);left:16px;right:16px;bottom:16px;}}`,
    'bottom':              `.${px}-host{width:100%;margin:24px 0 0 0;}`,
    'profooter':           `.${px}-host{width:100%;padding:16px 0;border-top:1px solid rgba(0,0,0,0.08);margin-top:24px;}`,
    'overlay':             `.${px}-host{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);}`,
    'modalpic':            `.${px}-host{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);}`,
    'mobile interstitial': `.${px}-host{position:fixed;bottom:0;left:0;right:0;z-index:9999;width:100%;}@media(min-width:769px){.${px}-host{display:none;}}`,
  };
  return base + (map[spaceType.toLowerCase()] || '');
}

exports.serveSiteScript = async (req, res) => {
  try {
    const { websiteId } = req.params;

    const [website, categories] = await Promise.all([
      Website.findById(websiteId).lean(),
      AdCategory.find({ websiteId }).lean(),
    ]);

    if (!website) return res.status(404).send('// Website not found');
    if (!categories.length) return res.status(200).send('// No ad spaces configured yet');

    const BACKEND  = process.env.BACKEND_URL  || 'https://yepper-backend-test.onrender.com';
    const FRONTEND = process.env.FRONTEND_URL || 'https://yepper.cc';

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    // Build per-category config
    const spaces = categories.map(cat => ({
      id:            cat._id.toString(),
      name:          cat.categoryName,
      spaceType:     cat.spaceType || 'inline content',
      mode:          cat.placementMode || 'auto',
      price:         cat.price,
      lang:          cat.defaultLanguage || 'english',
      px:            'yw' + cat._id.toString().slice(-6),
      wrap:          neutralClass(cat._id.toString()),
      css:           placementCSS(cat.spaceType || 'inline content', 'yw' + cat._id.toString().slice(-6)),
    }));

    const spacesJSON = JSON.stringify(spaces);

    // Analytics tracking snippet — fires once per page load, fire-and-forget
    const trackingSnippet = `
  /* ── Yepper Analytics tracker ──────────────────────────────── */
  (function(){
    try {
      var _ref = document.referrer || '';
      var _path = location.pathname || '/';
      var _payload = JSON.stringify({ websiteId: _wid, path: _path, referrer: _ref });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          _b + '/analytics/track',
          new Blob([JSON.stringify(_pv)], { type: 'application/json' })
        );
      } else {
        fetch(_b + '/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(_pv),
          mode: 'cors',
          credentials: 'omit'
        }).catch(function(){});
      }
    } catch(e) { /* tracking failure is non-fatal */ }
  })();
  /* ──────────────────────────────────────────────────────────── */
`;

    const script = `
(function(){
  /* Yepper Site Script — ${website.websiteName} */
  var D=document,
      _wid="${websiteId}",
      _b="${BACKEND}/api",
      _f="${FRONTEND}",
      _spaces=${spacesJSON},
      _rot=5000;

  var TR={
    english:    {title:'Available Advertising Space',price:'Price',cta:'Advertise Here'},
    french:     {title:'Espace Publicitaire Disponible',price:'Prix',cta:'Annoncez Ici'},
    kinyarwanda:{title:'Kwamamaza',price:"Igiciro cy'ukwezi",cta:'Kanda Hano'},
    kiswahili:  {title:'Nafasi ya Matangazo',price:'Bei',cta:'Tangaza Hapa'},
    chinese:    {title:'可用广告空间',price:'价格',cta:'在此广告'},
    spanish:    {title:'Espacio Publicitario Disponible',price:'Precio',cta:'Anuncie Aquí'}
  };

  function getLang(l){
    if(TR[l])return TR[l];
    var ul=(navigator.language||'en').toLowerCase().split('-')[0];
    return TR[{fr:'french',rw:'kinyarwanda',sw:'kiswahili',zh:'chinese',es:'spanish'}[ul]||'english'];
  }

  /* ── Inject styles for a space ───────────────────────── */
  function injectStyles(sp, custom){
    var sid='_ys_'+sp.id;
    if(D.getElementById(sid))return;
    var el=D.createElement('style');
    el.id=sid;
    var isH=custom.imagePosition==='left';
    var flexDir=isH?'row':'column';
    el.textContent=sp.css+\`
      .\${sp.px}-ad{display:block;width:\${custom.width?custom.width+'px':'100%'};max-width:\${custom.maxWidth||100}%;text-decoration:none;overflow:hidden;background:\${custom.backgroundColor||'#f1f1f1'};border:\${custom.borderWidth||1}px solid \${custom.borderColor||'rgba(255,255,255,0.18)'};border-radius:\${custom.borderRadius||16}px;box-shadow:\${custom.shadow==='none'?'none':custom.shadow==='small'?'0 2px 4px rgba(0,0,0,0.1)':custom.shadow==='large'?'0 20px 50px rgba(0,0,0,0.3)':'0 8px 32px rgba(31,38,135,0.18)'};transition:all 0.3s ease;position:relative;color:inherit;box-sizing:border-box;}
      .\${sp.px}-ad:hover{transform:translateY(-2px);}
      .\${sp.px}-inner{display:flex;flex-direction:\${flexDir};gap:16px;align-items:\${isH?'center':'stretch'};padding:14px;}
      .\${sp.px}-img-wrap{overflow:hidden;border-radius:10px;\${isH?'flex:0 0 40%;min-width:120px;':'width:100%;'}\${custom.showImage===false?'display:none;':''}}
      .\${sp.px}-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.3s;}
      .\${sp.px}-ad:hover .\${sp.px}-img{transform:scale(1.03);}
      .\${sp.px}-text{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0;}
      .\${sp.px}-title{font-size:\${custom.titleSize||16}px;font-weight:600;color:\${custom.titleColor||'rgba(0,0,0,0.9)'};margin:0 0 8px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .\${sp.px}-desc{font-size:\${custom.descriptionSize||14}px;color:\${custom.descriptionColor||'rgba(0,0,0,0.6)'};line-height:1.5;margin:0 0 12px;\${custom.showDescription===false?'display:none;':''}}
      .\${sp.px}-cta{display:inline-flex;align-items:center;align-self:flex-start;background:\${custom.ctaBackground||'#000'};color:\${custom.ctaColor||'#fff'};padding:8px 22px;border-radius:8px;font-size:\${custom.ctaSize||14}px;font-weight:500;\${custom.showCTA===false?'display:none;':''}}
      .\${sp.px}-credit{font-size:9px;color:rgba(0,0,0,0.4);padding:4px 8px;text-align:right;}
      .\${sp.px}-credit a{color:inherit;text-decoration:none;}
      .\${sp.px}-empty{padding:20px;text-align:center;background:#f5f5f5;border-radius:12px;}
      .\${sp.px}-empty-title{font-size:15px;font-weight:600;margin:0 0 6px;}
      .\${sp.px}-empty-price{font-size:13px;color:#555;margin:0 0 14px;}
      .\${sp.px}-empty-cta{display:inline-flex;align-items:center;background:#000;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;}
    \`;
    D.head.appendChild(el);
  }

  /* ── Find or create host for a space ─────────────────── */
  function getHost(sp){
    var existing=D.querySelector('[data-yid="'+sp.id+'"]');
    if(existing)return existing;

    var host=D.createElement('div');
    host.className=sp.px+'-host '+sp.wrap;
    host.setAttribute('data-yid',sp.id);

    /* Always check for an explicit placeholder div first,
       regardless of mode — this is what makes manual divs work */
    var ph=D.querySelector('[data-yepper-space="'+sp.id+'"]');
    if(ph){ph.appendChild(host);return host;}

    /* No placeholder found and space is manual — skip, nothing to render into */
    if(sp.mode==='manual'){return null;}

    /* Auto placement fallback */
    var st=sp.spaceType.toLowerCase();

    if(st==='header'){
      var hdr=D.querySelector('header,[role="banner"]');
      if(hdr){hdr.insertAdjacentElement('afterbegin',host);return host;}
    }
    if(st==='floating'||st==='overlay'||st==='modalpic'||st==='mobile interstitial'){
      D.body.appendChild(host);return host;
    }
    if(st==='bottom'||st==='profooter'){
      var ftr=D.querySelector('footer,[role="contentinfo"]');
      if(ftr){ftr.insertAdjacentElement('beforebegin',host);}
      else D.body.appendChild(host);
      return host;
    }
    if(st==='sidebar'||st==='stickysidebar'||st==='left rail'||st==='rightrail'){
      var aside=D.querySelector('aside,[role="complementary"],.sidebar,.side-bar,.widget-area');
      if(aside){aside.insertAdjacentElement('afterbegin',host);return host;}
    }
    if(st==='in feed'){
      var arts=D.querySelectorAll('article,.article,.post,.feed-item');
      if(arts.length>1){arts[1].insertAdjacentElement('afterend',host);return host;}
    }
    if(st==='above the fold'||st==='beneath title'||st==='inline content'){
      var main=D.querySelector('main,[role="main"],.main-content,.content,.post-content');
      if(main){main.insertAdjacentElement('afterbegin',host);return host;}
    }

    /* Last resort: after script tag */
    var scripts=D.getElementsByTagName('script');
    for(var si=scripts.length-1;si>=0;si--){
      if(scripts[si].src&&scripts[si].src.indexOf('/api/ads/script/site/')>-1){
        scripts[si].parentNode.insertBefore(host,scripts[si].nextSibling);
        return host;
      }
    }
    D.body.appendChild(host);
    return host;
  }

  /* ── Render ads into host ─────────────────────────────── */
  function renderAds(host, sp, data, custom){
    var lang=getLang(sp.lang);

    if(!data||!data.html){
      host.innerHTML=
        '<div class="'+sp.px+'-empty">'+
          '<p class="'+sp.px+'-empty-title">'+lang.title+'</p>'+
          '<p class="'+sp.px+'-empty-price">'+lang.price+': $'+sp.price+'/mo</p>'+
          '<a class="'+sp.px+'-empty-cta" href="'+_f+'/direct-ad?websiteId='+_wid+'&categoryId='+sp.id+'" target="_blank" rel="noopener">'+lang.cta+'</a>'+
        '</div>';
      return;
    }

    var html=data.html
      .replace(/yepper-ad-container|yepper-ad-item/g,sp.px+'-ad')
      .replace(/yepper-ad-link/g,sp.px+'-link')
      .replace(/yepper-ad-content/g,sp.px+'-inner')
      .replace(/yepper-ad-image-wrapper/g,sp.px+'-img-wrap')
      .replace(/yepper-ad-image/g,sp.px+'-img')
      .replace(/yepper-ad-text-content/g,sp.px+'-text')
      .replace(/yepper-ad-business-name/g,sp.px+'-title')
      .replace(/yepper-ad-description/g,sp.px+'-desc')
      .replace(/yepper-ad-cta/g,sp.px+'-cta');

    host.innerHTML='<div class="'+sp.px+'-credit">Ad by <a href="'+_f+'" target="_blank" rel="noopener">Yepper</a></div>'+html;

    var items=Array.from(host.querySelectorAll('.'+sp.px+'-ad'));
    if(!items.length){renderAds(host,sp,null,custom);return;}

    items.forEach(function(el,idx){el.style.display=idx===0?'block':'none';});

    function trackView(adId){
      try{navigator.sendBeacon(_b+'/ads/view/'+adId,'{}');}
      catch(e){fetch(_b+'/ads/view/'+adId,{method:'POST',mode:'cors',credentials:'omit'}).catch(function(){});}
    }

    items.forEach(function(el){
      var adId=el.dataset.adId;
      var lnk=el.querySelector('.'+sp.px+'-link')||el.querySelector('a');
      if(!lnk)return;
      var href=lnk.href;
      lnk.removeAttribute('href');
      lnk.style.cursor='pointer';
      lnk.addEventListener('click',function(ev){
        ev.preventDefault();
        try{navigator.sendBeacon(_b+'/ads/click/'+adId,'{}');}catch(e){}
        setTimeout(function(){window.open(href,'_blank','noopener');},80);
      });
    });

    /* Dismiss for overlays */
    if(sp.spaceType.toLowerCase()==='overlay'||sp.spaceType.toLowerCase()==='modalpic'){
      var btn=D.createElement('button');
      btn.textContent='×';
      btn.style.cssText='position:absolute;top:12px;right:16px;font-size:28px;background:none;border:none;cursor:pointer;color:#fff;z-index:1;';
      btn.onclick=function(){host.style.display='none';};
      host.appendChild(btn);
    }

    if(items.length>1){
      var cur=0;
      trackView(items[cur].dataset.adId);
      setInterval(function(){
        items[cur].style.display='none';
        cur=(cur+1)%items.length;
        items[cur].style.display='block';
        trackView(items[cur].dataset.adId);
      },_rot);
    } else {
      trackView(items[0].dataset.adId);
    }
  }

  /* ── Load and render one space ────────────────────────── */
  function loadSpace(sp){
    var ck='?z='+sp.id+'&r='+Math.random().toString(36).slice(2);

    fetch(_b+'/ad-categories/ads/customization/'+sp.id+ck,{cache:'no-store'})
      .then(function(r){return r.ok?r.json():Promise.resolve({});})
      .then(function(d){
        var custom=d.customization||{};
        injectStyles(sp,custom);
        var host=getHost(sp);
        if(!host)return; /* manual with no placeholder — skip */

        fetch(_b+'/ads/display?categoryId='+sp.id+'&r='+Date.now(),{cache:'no-store'})
          .then(function(r){return r.ok?r.json():null;})
          .then(function(data){renderAds(host,sp,data,custom);})
          .catch(function(){renderAds(host,sp,null,{});});
      })
      .catch(function(){
        injectStyles(sp,{});
        var host=getHost(sp);
        if(!host)return;
        fetch(_b+'/ads/display?categoryId='+sp.id,{cache:'no-store'})
          .then(function(r){return r.ok?r.json():null;})
          .then(function(data){renderAds(host,sp,data,{});})
          .catch(function(){renderAds(host,sp,null,{});});
      });
  }

  /* ── Load a space by raw category ID (for DOM-discovered divs) ── */
  function loadSpaceById(categoryId){
    /* If already handled by the pre-baked list, skip */
    for(var i=0;i<_spaces.length;i++){
      if(_spaces[i].id===categoryId)return;
    }
    /* Fetch the real category config from the API so we have correct
       price, spaceType, lang etc. before rendering */
    fetch(_b+'/ad-categories/space/'+categoryId+'?r='+Date.now(),{cache:'no-store'})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(cat){
        var px='yw'+categoryId.slice(-6);
        var st=(cat&&cat.spaceType)||'inline content';
        var wrappers=['content-widget','page-module','site-section','layout-block','view-unit','frame-item'];
        var wrap=wrappers[parseInt(categoryId.slice(-2),16)%wrappers.length];
        var sp={
          id:        categoryId,
          name:      (cat&&cat.categoryName)||'ad space',
          spaceType: st,
          mode:      'manual',
          price:     (cat&&cat.price)||0,
          lang:      (cat&&cat.defaultLanguage)||'english',
          px:        px,
          wrap:      wrap,
          css:       '.'+px+'-host{display:block;width:100%;box-sizing:border-box;position:relative;overflow:visible;}'
        };
        loadSpace(sp);
      })
      .catch(function(){
        /* Fallback: render with minimal config so the div isn't empty */
        var px='yw'+categoryId.slice(-6);
        var sp={id:categoryId,name:'ad space',spaceType:'inline content',mode:'manual',price:0,lang:'english',px:px,wrap:'content-widget',css:'.'+px+'-host{display:block;width:100%;}'};
        loadSpace(sp);
      });
  }

  /* ── Init all spaces ──────────────────────────────────── */
  function init(){
    /* 1. Load all pre-configured spaces */
    _spaces.forEach(function(sp){ loadSpace(sp); });

    /* 2. Scan DOM for any data-yepper-space divs not already covered. */
    var divs=D.querySelectorAll('[data-yepper-space]');
    for(var i=0;i<divs.length;i++){
      loadSpaceById(divs[i].getAttribute('data-yepper-space'));
    }

    /* 3. Fire analytics pageview ping */
    try{
      var _pv={
        websiteId:_wid,
        path: location.pathname || '/',
        referrer:D.referrer||''
      };
      if(navigator.sendBeacon){
        navigator.sendBeacon(_b+'/analytics/track',JSON.stringify(_pv));
      } else {
        fetch(_b+'/analytics/track',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(_pv),
          mode:'cors',
          credentials:'omit'
        }).catch(function(){});
      }
    }catch(e){}
  }

  D.readyState==='loading'
    ?D.addEventListener('DOMContentLoaded',init)
    :init();
})();
`;

    res.send(script);
  } catch (err) {
    console.error('SiteScriptController error:', err);
    res.status(500).send('// Error loading site ad script');
  }
};

/* Generate and save the site script tag on the website record */
exports.generateSiteScript = async (websiteId) => {
  const BACKEND = process.env.BACKEND_URL || 'https://yepper-backend-test.onrender.com';
  const src = `${BACKEND}/api/ads/script/site/${websiteId}`;
  const tag = `<script src="${src}" async></script>`;
  await require('../models/CreateWebsiteModel').findByIdAndUpdate(websiteId, { siteScript: tag });
  return tag;
};