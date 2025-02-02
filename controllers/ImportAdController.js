const ImportAd = require('../models/ImportAdModel');
const AdCategory = require('../models/AdCategoryModel');
const multer = require('multer');
const path = require('path');
const bucket = require('../config/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|mp4|avi|mov|mkv|webm|pdf/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type.'));
  },
});

exports.createImportAd = [upload.single('file'), async (req, res) => {
  try {
    const {
      userId,
      adOwnerEmail,
      businessName,
      businessLink,
      businessLocation,
      adDescription,
      selectedWebsites,
      selectedCategories,
    } = req.body;

    const websitesArray = JSON.parse(selectedWebsites);
    const categoriesArray = JSON.parse(selectedCategories);

    let imageUrl = '';
    let videoUrl = '';
    let pdfUrl = '';

    // Handle file upload
    if (req.file) {
      const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
      const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: req.file.mimetype,
      });

      await new Promise((resolve, reject) => {
        blobStream.on('error', (err) => {
          console.error('Upload error:', err);
          reject(new Error('Failed to upload file.'));
        });

        blobStream.on('finish', async () => {
          try {
            await blob.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            
            if (req.file.mimetype.startsWith('image')) {
              imageUrl = publicUrl;
            } else if (req.file.mimetype.startsWith('video')) {
              videoUrl = publicUrl;
            } else if (req.file.mimetype === 'application/pdf') {
              pdfUrl = publicUrl;
            }
            resolve();
          } catch (err) {
            console.error('Error making file public:', err);
            reject(new Error('Failed to make file public.'));
          }
        });

        blobStream.end(req.file.buffer);
      });
    }

    // Fetch all selected categories to validate website associations
    const categories = await AdCategory.find({
      _id: { $in: categoriesArray }
    });

    // Create a map of websiteId to its categories for efficient lookup
    const websiteCategoryMap = categories.reduce((map, category) => {
      const websiteId = category.websiteId.toString();
      if (!map.has(websiteId)) {
        map.set(websiteId, []);
      }
      map.get(websiteId).push(category._id);
      return map;
    }, new Map());

    // Create websiteSelections array with proper category associations
    const websiteSelections = websitesArray.map(websiteId => {
      // Get categories that belong to this website
      const websiteCategories = websiteCategoryMap.get(websiteId.toString()) || [];
      
      // Filter selected categories to only include ones that belong to this website
      const validCategories = categoriesArray.filter(categoryId => 
        websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
      );

      return {
        websiteId,
        categories: validCategories,
        approved: false,
        approvedAt: null
      };
    }).filter(selection => selection.categories.length > 0); // Only include websites that have matching categories

    // Validate that we have at least one valid website-category combination
    if (websiteSelections.length === 0) {
      return res.status(400).json({
        error: 'Invalid Selection',
        message: 'No valid website and category combinations found'
      });
    }

    // Create new ad entry with restructured data
    const newRequestAd = new ImportAd({
      userId,
      adOwnerEmail,
      imageUrl,
      videoUrl,
      pdfUrl,
      businessName,
      businessLink,
      businessLocation,
      adDescription,
      websiteSelections,
      confirmed: false,
      clicks: 0,
      views: 0
    });

    const savedRequestAd = await newRequestAd.save();

    // Populate the saved ad with website and category details
    const populatedAd = await ImportAd.findById(savedRequestAd._id)
      .populate('websiteSelections.websiteId')
      .populate('websiteSelections.categories');

    res.status(201).json(populatedAd);
  } catch (err) {
    console.error('Error creating ad:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: err.message 
    });
  }
}];

exports.getAdsByUserId = async (req, res) => {
  const userId = req.params.userId;

  try {
    const ads = await ImportAd.find({ userId })
      .lean()
      .select(
        'businessName businessLink businessLocation adDescription imageUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces'
      );

    res.status(200).json(ads);
  } catch (err) {
    console.error('Error fetching ads:', err);
    res.status(500).json({ error: 'Failed to fetch ads' });
  }
};

exports.getAllAds = async (req, res) => {
  try {
    const ads = await ImportAd.find();
    res.status(200).json(ads);
  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAdByIds = async (req, res) => {
  const adId = req.params.id;

  try {
    const ad = await ImportAd.findById(adId)
      .lean()  // Faster loading
      .select('businessName businessLink businessLocation adDescription imageUrl pdfUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces');

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    res.status(200).json(ad);
  } catch (error) {
    console.error('Error fetching ad by ID:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getProjectsByUserId = async (req, res) => {
  const userId = req.params.userId;

  try {
    const approvedAds = await ImportAd.find({ userId, approved: true })
      .lean()
      .populate('selectedWebsites', 'websiteName websiteLink')
      .populate('selectedCategories', 'categoryName description')
      .populate('selectedSpaces', 'spaceType price availability')
      .select('businessName businessLink businessLocation adDescription imageUrl pdfUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces');

    const pendingAds = await ImportAd.find({ userId, approved: false })
      .lean()
      .populate('selectedWebsites', 'websiteName websiteLink')
      .populate('selectedCategories', 'categoryName description')
      .populate('selectedSpaces', 'spaceType price availability')
      .select('businessName businessLink businessLocation adDescription approved selectedWebsites selectedCategories selectedSpaces');
      
    res.status(200).json({
      approvedAds,
      pendingAds
    });
  } catch (error) {
    console.error('Error fetching ads by user ID:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAdsByUserIdWithClicks = async (req, res) => {
  const userId = req.params.userId;
  try {
    const ads = await ImportAd.find({ userId });
    for (const ad of ads) {
      const clicks = await AdClick.find({ adId: ad._id }).exec();
      ad.clicks = clicks.length;
      ad.websites = [...new Set(clicks.map(click => click.website))]; // Unique websites
    }
    res.status(200).json(ads);
  } catch (error) {
    console.error('Error fetching ads with clicks:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};