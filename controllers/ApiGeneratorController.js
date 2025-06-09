// // ApiGeneratorController.js
// const encryptFunction = (code) => {
//   // This is a simple example - in production use more secure encryption
//   const compressed = Buffer.from(code).toString('base64');
//   return `eval(atob("${compressed}"))`;
// };

// exports.generateApi = async (req, res) => {
//   const { websiteId, categoryId, selectedSpaces, language } = req.body;

//   const generateSecureScript = (spaceId, websiteId, categoryId) => {
//     const baseCode = `
//       (function(){
//         const _s="${spaceId}",_w="${websiteId}",_c="${categoryId}";
//         const _b="https://yepper-backend.onrender.com";
//         const _l=()=>{
//           const s=document.createElement("script");
//           const c="y"+Math.random().toString(36).substr(2,9);
//           window[c]=r=>{
//             document.getElementById(_s+"-ad").innerHTML=r.html;
//             delete window[c];
//           };
//           s.src=_b+"/api/ads/display?space="+_s+"&website="+_w+"&category="+_c+"&callback="+c;
//           document.body.appendChild(s);
//         };
//         const _r=(i)=>{
//           new Image().src=_b+"/api/ads/click?adId="+i;
//         };
//         const _v=(i)=>{
//           new Image().src=_b+"/api/ads/view?adId="+i;
//         };
//         document.write('<div id="'+_s+'-ad"></div>');
//         _l();
//       })();
//     `;

//     return encryptFunction(baseCode);
//   };

//   try {
//     const apiCodes = {};
    
//     Object.keys(selectedSpaces).forEach((spaceType) => {
//       if (selectedSpaces[spaceType]) {
//         const secureScript = generateSecureScript(spaceType, websiteId, categoryId);
        
//         if (language === 'HTML') {
//           apiCodes[spaceType] = `<script>${secureScript}</script>`;
//         } else if (language === 'JavaScript') {
//           apiCodes[spaceType] = secureScript;
//         } else if (language === 'PHP') {
//           apiCodes[spaceType] = `<?php echo '<script>${secureScript}</script>'; ?>`;
//         } else if (language === 'Python') {
//           apiCodes[spaceType] = `print('<script>${secureScript}</script>')`;
//         }
//       }
//     });

//     res.status(200).json({ apiCodes });
//   } catch (error) {
//     console.error('Error generating API code:', error);
//     res.status(500).json({ message: 'Failed to generate API code', error });
//   }
// };

// ApiGeneratorController.js
// ApiGeneratorController.js
const encryptFunction = (code) => {
  const compressed = Buffer.from(code).toString('base64');
  return `eval(atob("${compressed}"))`;
};

exports.generateApi = async (req, res) => {
  const { websiteId, categoryId, selectedSpaces, language } = req.body;

  const generateSecureScript = (spaceId, websiteId, categoryId) => {
    const baseCode = `
      (function(){
        const _s="${spaceId}",_w="${websiteId}",_c="${categoryId}";
        const _b="https://yepper-backend.onrender.com";
        const _l=()=>{
          const s=document.createElement("script");
          const c="y"+Math.random().toString(36).substr(2,9);
          window[c]=r=>{
            document.getElementById(_s+"-ad").innerHTML=r.html;
            delete window[c];
          };
          s.src=_b+"/api/ads/display?space="+_s+"&website="+_w+"&category="+_c+"&callback="+c;
          document.body.appendChild(s);
        };
        const _r=(i)=>{
          new Image().src=_b+"/api/ads/click?adId="+i;
        };
        const _v=(i)=>{
          new Image().src=_b+"/api/ads/view?adId="+i;
        };
        document.write('<div id="'+_s+'-ad"></div>');
        _l();
      })();
    `;

    return encryptFunction(baseCode);
  };

  try {
    const apiCodes = {};
    
    Object.keys(selectedSpaces).forEach((spaceType) => {
      if (selectedSpaces[spaceType]) {
        const secureScript = generateSecureScript(spaceType, websiteId, categoryId);
        
        if (language === 'HTML') {
          apiCodes[spaceType] = `<script>${secureScript}</script>`;
        } else if (language === 'JavaScript') {
          apiCodes[spaceType] = secureScript;
        } else if (language === 'PHP') {
          apiCodes[spaceType] = `<?php echo '<script>${secureScript}</script>'; ?>`;
        } else if (language === 'Python') {
          apiCodes[spaceType] = `print('<script>${secureScript}</script>')`;
        }
      }
    });

    res.status(200).json({ apiCodes });
  } catch (error) {
    console.error('Error generating API code:', error);
    res.status(500).json({ message: 'Failed to generate API code', error });
  }
};