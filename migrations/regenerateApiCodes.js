// migrations/regenerateApiCodes.js
// Run once: node migrations/regenerateApiCodes.js
// Regenerates apiCodes for all existing categories using current BACKEND_URL env var.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AdCategory = require('../AdPromoter/models/CreateCategoryModel');

const BACKEND  = process.env.BACKEND_URL  || 'http://localhost:5000';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-auth', {
    useNewUrlParser: true, useUnifiedTopology: true
  });
  console.log('MongoDB connected');

  const categories = await AdCategory.find({});
  console.log(`Found ${categories.length} categories to update`);

  let updated = 0;
  for (const cat of categories) {
    const adSrc = `${BACKEND}/api/ads/script/${cat._id}`;

    cat.apiCodes = {
      HTML: [
        `<!-- Yepper Ad: ${cat.categoryName} — Auto-Placement -->`,
        `<!-- Drop this ONE tag anywhere. The script places itself by your chosen space type. -->`,
        `<script src="${adSrc}" async></script>`,
      ].join('\n'),

      JavaScript: [
        `// Yepper Ad — Auto-placement (React / Vue / Next.js / Svelte / Angular)`,
        `useEffect(() => {`,
        `  const s = document.createElement('script');`,
        `  s.src = '${adSrc}';`,
        `  s.async = true;`,
        `  document.body.appendChild(s);`,
        `  return () => { try { document.body.removeChild(s); } catch(e){} };`,
        `}, []);`,
      ].join('\n'),

      PHP: [
        `<?php /* Yepper Ad: ${cat.categoryName} — Auto-Placement */ ?>`,
        `<script src="${adSrc}" async></script>`,
      ].join('\n'),

      Python: [
        `# Yepper Ad: ${cat.categoryName} — Auto-Placement`,
        `ad_tag = '<script src="${adSrc}" async></script>'`,
      ].join('\n'),

      HTML_manual: [
        `<!-- Yepper Ad: ${cat.categoryName} — Manual Placement -->`,
        `<div data-yepper-space="${cat._id}"></div>`,
        `<script src="${adSrc}" async></script>`,
      ].join('\n'),

      JavaScript_manual: [
        `// Yepper Ad — Manual placement`,
        `// Step 1: <div data-yepper-space="${cat._id}"></div>`,
        `useEffect(() => {`,
        `  const s = document.createElement('script');`,
        `  s.src = '${adSrc}';`,
        `  s.async = true;`,
        `  document.body.appendChild(s);`,
        `  return () => { try { document.body.removeChild(s); } catch(e){} };`,
        `}, []);`,
      ].join('\n'),

      PHP_manual: [
        `<?php /* Yepper Ad: ${cat.categoryName} — Manual Placement */ ?>`,
        `<div data-yepper-space="${cat._id}"></div>`,
        `<script src="${adSrc}" async></script>`,
      ].join('\n'),

      Python_manual: [
        `# Yepper Ad: ${cat.categoryName} — Manual Placement`,
        `placement_div = '<div data-yepper-space="${cat._id}"></div>'`,
        `ad_script = '<script src="${adSrc}" async></script>'`,
      ].join('\n'),
    };

    await cat.save();
    updated++;
    console.log(`  ✓ [${updated}/${categories.length}] ${cat.categoryName} — ${adSrc}`);
  }

  console.log(`\nDone. ${updated} categories updated with BACKEND_URL: ${BACKEND}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});