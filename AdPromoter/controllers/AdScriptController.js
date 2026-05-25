// AdScriptController.js
// Universal one-script ad loader — works on any framework/language.
// Supports multiple spaces per site, smart auto-placement by spaceType,
// and ad-blocker evasion via neutral class names and randomized identifiers.

const AdCategory = require('../models/CreateCategoryModel');

// ── Ad-blocker evasion: rotate neutral wrapper names ──────────
const WRAPPER_ALIASES = [
  'content-widget', 'page-module', 'site-section',
  'layout-block', 'view-unit', 'frame-item',
  'display-zone', 'content-box', 'media-section',
  'page-element', 'render-block', 'ui-widget',
];

function neutralClass(scriptId) {
  const idx = parseInt(scriptId.slice(-2), 16) % WRAPPER_ALIASES.length;
  return WRAPPER_ALIASES[idx];
}

// ── Position CSS per spaceType ────────────────────────────────
function placementStyles(spaceType, prefix) {
  const base = `
    .${prefix}-host {
      display: block;
      width: 100%;
      box-sizing: border-box;
      position: relative;
      overflow: visible;
    }
  `;

  const variants = {
    'Header': `
      .${prefix}-host {
        width: 100%;
        top: 0; left: 0;
        z-index: 900;
        max-height: 120px;
      }`,
    'Above The Fold': `
      .${prefix}-host {
        width: 100%;
        margin: 0 0 16px 0;
      }`,
    'Beneath Title': `
      .${prefix}-host {
        width: 100%;
        margin: 12px 0 20px 0;
      }`,
    'In Feed': `
      .${prefix}-host {
        width: 100%;
        margin: 16px 0;
        border-radius: 12px;
        overflow: hidden;
      }`,
    'Inline Content': `
      .${prefix}-host {
        float: right;
        width: 300px;
        margin: 0 0 12px 20px;
        clear: right;
      }
      @media (max-width: 600px) {
        .${prefix}-host { float: none; width: 100%; margin: 12px 0; }
      }`,
    'Sidebar': `
      .${prefix}-host {
        width: 100%;
        margin: 0 0 16px 0;
        max-width: 300px;
      }`,
    'Left Rail': `
      .${prefix}-host {
        width: 160px;
        position: sticky;
        top: 80px;
        margin-right: 16px;
      }
      @media (max-width: 768px) {
        .${prefix}-host { width: 100%; position: static; }
      }`,
    'rightRail': `
      .${prefix}-host {
        width: 160px;
        position: sticky;
        top: 80px;
        margin-left: 16px;
      }
      @media (max-width: 768px) {
        .${prefix}-host { width: 100%; position: static; }
      }`,
    'stickySidebar': `
      .${prefix}-host {
        position: sticky;
        top: 80px;
        width: 100%;
        max-width: 300px;
        z-index: 100;
      }`,
    'Floating': `
      .${prefix}-host {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 320px;
        z-index: 9999;
        filter: drop-shadow(0 8px 24px rgba(0,0,0,0.18));
      }
      @media (max-width: 480px) {
        .${prefix}-host { width: calc(100% - 32px); left: 16px; right: 16px; bottom: 16px; }
      }`,
    'Bottom': `
      .${prefix}-host {
        width: 100%;
        margin: 24px 0 0 0;
      }`,
    'proFooter': `
      .${prefix}-host {
        width: 100%;
        padding: 16px 0;
        border-top: 1px solid rgba(0,0,0,0.08);
        margin-top: 24px;
      }`,
    'overlay': `
      .${prefix}-host {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(2px);
      }`,
    'modalPic': `
      .${prefix}-host {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.6);
      }`,
    'Mobile Interstitial': `
      .${prefix}-host {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 9999;
        width: 100%;
      }
      @media (min-width: 769px) {
        .${prefix}-host { display: none; }
      }`,
  };

  return base + (variants[spaceType] || '');
}

// ─────────────────────────────────────────────────────────────
exports.serveAdScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const adCategory = await AdCategory.findById(scriptId)
      .populate('websiteId')
      .lean();

    if (!adCategory) return res.status(404).send('// Ad space not found');

    const BACKEND  = process.env.BACKEND_URL || 'https://yepper-backend-test.onrender.com';
    const FRONTEND = process.env.FRONTEND_URL || 'https://yepper.cc';

    const categoryPrice   = adCategory.price;
    const defaultLanguage = adCategory.defaultLanguage || 'english';
    const websiteId       = adCategory.websiteId._id;
    const websiteName     = adCategory.websiteId.websiteName || 'This website';
    const categoryName    = adCategory.categoryName || 'ad space';
    const spaceType       = adCategory.spaceType || 'Inline Content';

    // Evasion: neutral wrapper alias based on category id
    const wrapAlias = neutralClass(scriptId);
    // Unique prefix per category — avoids collision when multiple spaces on same page
    const prefix = 'yw' + scriptId.slice(-6);
    const timestamp = Date.now();

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('ETag', `"${scriptId}-${timestamp}"`);

    const script = `
(function(){
  /* Yepper display unit — ${categoryName} */
  var D=document,
      _i="${scriptId}",
      _w="${websiteId}",
      _b="${BACKEND}/api",
      _f="${FRONTEND}",
      _p=${categoryPrice},
      _l="${defaultLanguage}",
      _t=5000,
      _sp="${spaceType}",
      _px="${prefix}",
      _wa="${wrapAlias}";

  /* ── 1. Inject styles ──────────────────────────────────── */
  function injectStyles(custom){
    var sid='_ys_'+_i;
    var el=D.getElementById(sid);
    if(!el){el=D.createElement('style');el.id=sid;D.head.appendChild(el);}

    var placementCss="${placementStyles(spaceType, prefix).replace(/\n/g,' ').replace(/"/g,'\\"')}";

    var isH=custom.imagePosition==='left';
    var flexDir=isH?'row':'column';

    var base=placementCss+\`
      .\${_px}-ad{
        display:block;
        width:\${custom.width?custom.width+'px':'100%'};
        max-width:\${custom.maxWidth||100}%;
        text-decoration:none;
        overflow:hidden;
        background:\${custom.backgroundColor||'#f1f1f1'};
        border:\${custom.borderWidth||1}px solid \${custom.borderColor||'rgba(255,255,255,0.18)'};
        border-radius:\${custom.borderRadius||16}px;
        box-shadow:\${custom.shadow==='none'?'none':custom.shadow==='small'?'0 2px 4px rgba(0,0,0,0.1)':custom.shadow==='large'?'0 20px 50px rgba(0,0,0,0.3)':'0 8px 32px rgba(31,38,135,0.18)'};
        transition:all 0.3s ease;
        position:relative;
        color:inherit;
        padding:\${custom.padding||0}px;
        box-sizing:border-box;
      }
      .\${_px}-ad:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(31,38,135,0.28);}
      .\${_px}-inner{display:flex;flex-direction:\${flexDir};gap:16px;align-items:\${isH?'center':'stretch'};padding:14px;}
      .\${_px}-img-wrap{overflow:hidden;border-radius:10px;\${isH?'flex:0 0 40%;min-width:120px;':'width:100%;'}\${custom.showImage===false?'display:none;':''}}
      .\${_px}-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.3s ease;}
      .\${_px}-ad:hover .\${_px}-img{transform:scale(1.03);}
      .\${_px}-text{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0;}
      .\${_px}-title{font-size:\${custom.titleSize||16}px;font-weight:600;color:\${custom.titleColor||'rgba(0,0,0,0.9)'};margin:0 0 8px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .\${_px}-desc{font-size:\${custom.descriptionSize||14}px;color:\${custom.descriptionColor||'rgba(0,0,0,0.6)'};line-height:1.5;margin:0 0 12px;display:-webkit-box;-webkit-line-clamp:\${isH?2:3};-webkit-box-orient:vertical;overflow:hidden;\${custom.showDescription===false?'display:none;':''}}
      .\${_px}-cta{display:inline-flex;align-items:center;align-self:flex-start;background:\${custom.ctaBackground||'#000'};color:\${custom.ctaColor||'#fff'};padding:8px 22px;border-radius:8px;font-size:\${custom.ctaSize||14}px;font-weight:500;transition:all 0.2s ease;\${custom.showCTA===false?'display:none;':''}}
      .\${_px}-cta:hover{opacity:0.85;}
      .\${_px}-credit{font-size:9px;color:rgba(0,0,0,0.4);padding:4px 8px;text-align:right;}
      .\${_px}-credit a{color:inherit;text-decoration:none;}
      .\${_px}-empty{padding:20px;text-align:center;background:#f5f5f5;border-radius:12px;}
      .\${_px}-empty-title{font-size:15px;font-weight:600;margin:0 0 6px;}
      .\${_px}-empty-price{font-size:13px;color:#555;margin:0 0 14px;}
      .\${_px}-empty-cta{display:inline-flex;align-items:center;background:#000;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;transition:background 0.2s;}
      .\${_px}-empty-cta:hover{background:#e84118;}
      @media(prefers-color-scheme:dark){
        .\${_px}-ad{background:rgba(0,0,0,0.22);border-color:rgba(255,255,255,0.12);}
        .\${_px}-title{color:rgba(255,255,255,0.92);}
        .\${_px}-desc{color:rgba(255,255,255,0.65);}
        .\${_px}-credit{color:rgba(255,255,255,0.3);}
        .\${_px}-empty{background:rgba(255,255,255,0.06);}
        .\${_px}-empty-title{color:#fff;}
        .\${_px}-empty-price{color:rgba(255,255,255,0.5);}
      }
    \`;

    /* Merge custom CSS if any */
    if(custom.customCSS){
      base+=custom.customCSS
        .replace(/\\.ad-container/g,'.'+_px+'-ad')
        .replace(/\\.ad-title/g,'.'+_px+'-title')
        .replace(/\\.ad-description/g,'.'+_px+'-desc')
        .replace(/\\.ad-cta/g,'.'+_px+'-cta')
        .replace(/\\.ad-image/g,'.'+_px+'-img');
    }
    el.textContent=base;
  }

  /* ── 2. Find or create host container ──────────────────── */
  function getHost(){
    var existing=D.querySelector('[data-yid="'+_i+'"]');
    if(existing)return existing;

    var host=D.createElement('div');
    /* neutral class name to evade simple block-lists */
    host.className=_px+'-host '+_wa;
    host.setAttribute('data-yid',_i);

    /* placement: look for explicit placeholder first */
    var ph=D.querySelector('[data-yepper-space="'+_i+'"]')||
           D.querySelector('[data-yepper-ad="'+_i+'"]');
    if(ph){ph.appendChild(host);return host;}

    /* Auto-placement by spaceType */
    var sp=_sp.toLowerCase();

    if(sp==='header'){
      var hdr=D.querySelector('header')||D.querySelector('[role="banner"]')||D.body.firstElementChild;
      if(hdr)hdr.insertAdjacentElement('afterbegin',host); else D.body.insertAdjacentElement('afterbegin',host);
      return host;
    }
    if(sp==='floating'||sp==='overlay'||sp==='modalpic'||sp==='mobile interstitial'){
      D.body.appendChild(host);
      return host;
    }
    if(sp==='bottom'||sp==='profooter'){
      var ftr=D.querySelector('footer')||D.querySelector('[role="contentinfo"]');
      if(ftr)ftr.insertAdjacentElement('beforebegin',host); else D.body.appendChild(host);
      return host;
    }
    if(sp==='sidebar'||sp==='stickysidebar'||sp==='left rail'||sp==='rightrail'){
      var aside=D.querySelector('aside')||D.querySelector('[role="complementary"]');
      if(aside){aside.insertAdjacentElement('afterbegin',host);return host;}
    }
    if(sp==='in feed'){
      var articles=D.querySelectorAll('article');
      if(articles.length>2){articles[1].insertAdjacentElement('afterend',host);return host;}
    }
    if(sp==='above the fold'){
      var main=D.querySelector('main')||D.querySelector('[role="main"]')||D.body;
      main.insertAdjacentElement('afterbegin',host);
      return host;
    }

    /* Fallback: insert after the current script tag */
    var scripts=D.getElementsByTagName('script');
    for(var si=scripts.length-1;si>=0;si--){
      if(scripts[si].src&&scripts[si].src.indexOf('/api/ads/script/'+_i)>-1){
        scripts[si].parentNode.insertBefore(host,scripts[si].nextSibling);
        return host;
      }
    }
    D.body.appendChild(host);
    return host;
  }

  /* ── 3. Render translations ────────────────────────────── */
  var TR={
    english:{title:'Available Advertising Space',price:'Price',cta:'Advertise Here'},
    french:{title:'Espace Publicitaire Disponible',price:'Prix',cta:'Annoncez Ici'},
    kinyarwanda:{title:'Kwamamaza',price:"Igiciro cy'ukwezi",cta:'Kanda Hano'},
    kiswahili:{title:'Nafasi ya Matangazo',price:'Bei',cta:'Tangaza Hapa'},
    chinese:{title:'可用广告空间',price:'价格',cta:'在此广告'},
    spanish:{title:'Espacio Publicitario Disponible',price:'Precio',cta:'Anuncie Aquí'}
  };

  function getLang(){
    var l=_l;
    if(!TR[l]){
      var ul=(navigator.language||'en').toLowerCase().split('-')[0];
      l={fr:'french',rw:'kinyarwanda',sw:'kiswahili',zh:'chinese',es:'spanish'}[ul]||'english';
    }
    return TR[l];
  }

  function emptyState(host){
    var lang=getLang();
    host.innerHTML=
      '<div class="'+_px+'-empty">'+
        '<p class="'+_px+'-empty-title">'+lang.title+'</p>'+
        '<p class="'+_px+'-empty-price">'+lang.price+': $'+_p+'/mo</p>'+
        '<a class="'+_px+'-empty-cta" href="'+_f+'/direct-ad?websiteId='+_w+'&categoryId='+_i+'" target="_blank" rel="noopener">'+lang.cta+'</a>'+
      '</div>';
  }

  function credit(){
    return '<div class="'+_px+'-credit">Ad by <a href="'+_f+'" target="_blank" rel="noopener">Yepper</a></div>';
  }

  /* ── 4. Render ads ─────────────────────────────────────── */
  function renderAds(host,data){
    if(!data||!data.html){emptyState(host);return;}

    /* Remap generic class names to scoped prefix */
    var html=data.html
      .replace(/yepper-ad-container/g,_px+'-ad')
      .replace(/yepper-ad-item/g,_px+'-ad')
      .replace(/yepper-ad-link/g,_px+'-link')
      .replace(/yepper-ad-content/g,_px+'-inner')
      .replace(/yepper-ad-image-wrapper/g,_px+'-img-wrap')
      .replace(/yepper-ad-image/g,_px+'-img')
      .replace(/yepper-ad-text-content/g,_px+'-text')
      .replace(/yepper-ad-business-name/g,_px+'-title')
      .replace(/yepper-ad-description/g,_px+'-desc')
      .replace(/yepper-ad-cta/g,_px+'-cta');

    host.innerHTML=credit()+html;

    var items=Array.from(host.querySelectorAll('.'+_px+'-ad'));
    if(!items.length){emptyState(host);return;}

    /* Hide all except first */
    items.forEach(function(el,idx){el.style.display=idx===0?'block':'none';});

    /* Track views + clicks */
    function trackView(adId){
      try{
        /* Use beacon for reliability and to avoid being flagged as xhr tracker */
        navigator.sendBeacon(_b+'/ads/view/'+adId,'{}');
      }catch(e){
        fetch(_b+'/ads/view/'+adId,{method:'POST',mode:'cors',credentials:'omit'}).catch(function(){});
      }
    }

    items.forEach(function(el){
      var adId=el.dataset.adId;
      var lnk=el.querySelector('.'+_px+'-link')||el.querySelector('a');
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

    /* Dismiss button for overlays */
    if(_sp==='overlay'||_sp==='modalPic'){
      var btn=D.createElement('button');
      btn.textContent='×';
      btn.style.cssText='position:absolute;top:12px;right:16px;font-size:28px;background:none;border:none;cursor:pointer;color:#fff;z-index:1;';
      btn.onclick=function(){host.style.display='none';};
      host.style.position='fixed';
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
      },_t);
    } else {
      trackView(items[0].dataset.adId);
    }
  }

  /* ── 5. Load customization then ads ───────────────────── */
  function init(){
    /* Use a neutral param name to avoid common blocker rules */
    var ck='?z='+_i+'&r='+Math.random().toString(36).slice(2);

    fetch(_b+'/ad-categories/ads/customization/'+_i+ck,{cache:'no-store'})
      .then(function(r){return r.ok?r.json():Promise.resolve({});})
      .then(function(d){
        var custom=d.customization||{};
        injectStyles(custom);
        var host=getHost();

        fetch(_b+'/ads/display?categoryId='+_i+'&r='+Date.now(),{cache:'no-store'})
          .then(function(r){return r.ok?r.json():null;})
          .then(function(data){renderAds(host,data);})
          .catch(function(){emptyState(host);});
      })
      .catch(function(){
        injectStyles({});
        var host=getHost();
        fetch(_b+'/ads/display?categoryId='+_i,{cache:'no-store'})
          .then(function(r){return r.ok?r.json():null;})
          .then(function(data){renderAds(host,data);})
          .catch(function(){emptyState(host);});
      });

    /* Listen for live customization refreshes */
    try{
      var bc=new BroadcastChannel('yepper_ads');
      bc.onmessage=function(ev){
        if(ev.data&&ev.data.categoryId===_i)location.reload();
      };
    }catch(e){}
  }

  D.readyState==='loading'?D.addEventListener('DOMContentLoaded',init):init();
})();
`;

    res.send(script);
  } catch (err) {
    console.error('AdScriptController error:', err);
    res.status(500).send('// Error loading ad unit');
  }
};