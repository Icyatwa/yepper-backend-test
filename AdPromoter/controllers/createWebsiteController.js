// createWebsiteController.js
const Website = require('../models/CreateWebsiteModel');
const multer = require('multer');
const User = require('../../models/User'); // CHANGE: Added User model import for custom auth
const path = require('path');
const jwt = require('jsonwebtoken'); // ADD THIS LINE - Missing import
const cloudinary = require('../../config/storage');
const dns = require('dns').promises;
const crypto = require('crypto');
require('dotenv').config();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase()) && 
                    file.mimetype.startsWith('image/');
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type. Only image files are allowed.'));
  },
});

const uploadToCloudinary = async (file) => {
  try {
    console.log('Starting Cloudinary upload for:', file.originalname);

    const fileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'yepper_websites',
          public_id: fileName,
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return reject(new Error(`Upload failed: ${error.message}`));
          }
          console.log('File uploaded successfully to:', result.secure_url);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(file.buffer);
    });

  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token is required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};


// Compute traffic tier from monthly visitors
function computeTrafficTier(visitors) {
  const v = parseInt(visitors) || 0;
  if (v <= 2000) return 'starter';
  if (v <= 10000) return 'basic';
  if (v <= 50000) return 'standard';
  if (v <= 200000) return 'premium';
  return 'elite';
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

function normalizeDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function buildTxtRecord(token) {
  return `yepper-verify=${token}`;
}

// ─── Initiate domain verification ────────────────────────────────────────────
// POST /api/createWebsite/initiate-verification
// Body: { websiteLink }
// Returns: { verificationToken, txtRecord, txtHost } — no DB write yet
exports.initiateVerification = [authenticateToken, async (req, res) => {
  try {
    const { websiteLink } = req.body;
    if (!websiteLink) {
      return res.status(400).json({ message: 'websiteLink is required' });
    }

    const domain = normalizeDomain(websiteLink);
    if (!domain) {
      return res.status(400).json({ message: 'Invalid website URL' });
    }

    // Reuse existing token if the same owner already started for this domain
    let existing = await Website.findOne({
      websiteLink,
      ownerId: req.user.id.toString(),
      verificationStatus: 'pending',
    }).lean();

    const token = existing?.verificationToken || crypto.randomBytes(24).toString('hex');

    res.status(200).json({
      domain,
      verificationToken: token,
      txtRecord: buildTxtRecord(token),
      txtHost: `_yepper-challenge`,
      instructions: [
        `Log in to your DNS provider (e.g. Namecheap, Cloudflare, GoDaddy).`,
        `Add a new TXT record with the host/name: _yepper-challenge`,
        `Set the value to: ${buildTxtRecord(token)}`,
        `Save the record. DNS propagation can take a few minutes — click "Verify" when done.`,
      ],
    });
  } catch (error) {
    console.error('initiateVerification error:', error);
    res.status(500).json({ message: 'Failed to initiate domain verification', error: error.message });
  }
}];

// ─── Check domain verification ────────────────────────────────────────────────
// POST /api/createWebsite/verify-domain
// Body: { websiteLink, verificationToken }
exports.verifyDomain = [authenticateToken, async (req, res) => {
  try {
    const { websiteLink, verificationToken } = req.body;
    if (!websiteLink || !verificationToken) {
      return res.status(400).json({ message: 'websiteLink and verificationToken are required' });
    }

    const domain = normalizeDomain(websiteLink);
    if (!domain) {
      return res.status(400).json({ message: 'Invalid website URL' });
    }

    const expectedTxt = buildTxtRecord(verificationToken);
    const lookupHost = `_yepper-challenge.${domain}`;

    let found = false;
    try {
      const records = await dns.resolveTxt(lookupHost);
      // records is string[][]
      found = records.some(rdata => rdata.join('').includes(expectedTxt));
    } catch (dnsErr) {
      // ENOTFOUND / ENODATA — record not yet present
      found = false;
    }

    if (!found) {
      return res.status(200).json({
        verified: false,
        message: `TXT record not found yet. Make sure you added "_yepper-challenge" with value "${expectedTxt}" to your DNS and allow a few minutes for propagation.`,
      });
    }

    // Mark token as verified (upsert so it survives even if website doc doesn't exist yet)
    // We store it in a lightweight way — the full website document is created in createWebsiteWithCategories
    res.status(200).json({
      verified: true,
      verificationToken,
      domain,
      message: 'Domain verified successfully!',
    });
  } catch (error) {
    console.error('verifyDomain error:', error);
    res.status(500).json({ message: 'Failed to verify domain', error: error.message });
  }
}];

exports.prepareWebsite = [upload.single('file'), authenticateToken, async (req, res) => {
  try {
    const { websiteName, websiteLink } = req.body;
    const ownerId = req.user.id.toString();

    if (!websiteName || !websiteLink) {
      return res.status(400).json({ message: 'Website name and link are required' });
    }

    // Check if website URL already exists
    const existingWebsite = await Website.findOne({ websiteLink }).lean();
    if (existingWebsite) {
      return res.status(409).json({ message: 'Website URL already exists' });
    }

    let imageUrl = '';

    if (req.file) {
      try {
        console.log('Processing file upload:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
        
        imageUrl = await uploadToCloudinary(req.file);
        console.log('Upload completed successfully');
      } catch (uploadError) {
        console.error('File upload failed:', uploadError);
        return res.status(500).json({ 
          message: 'Failed to upload file. Please try again.',
          error: uploadError.message 
        });
      }
    }

    // Return prepared data without saving to database
    const websiteData = {
      ownerId,
      websiteName,
      websiteLink,
      imageUrl,
      tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // Temporary ID for frontend
    };

    res.status(200).json({
      ...websiteData,
      nextStep: 'business-categories'
    });
  } catch (error) {
    console.error('Error preparing website:', error);
    res.status(500).json({ 
      message: 'Failed to prepare website',
      error: error.message 
    });
  }
}];

exports.uploadWebsiteImage = [
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { websiteId } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Verify website exists and belongs to user
      const website = await Website.findById(websiteId);
      if (!website) {
        return res.status(404).json({ message: 'Website not found' });
      }
      
      if (website.ownerId !== req.user.id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }

      // Upload to Cloudinary
      const imageUrl = await uploadToCloudinary(req.file);

      // Update website with image URL
      website.imageUrl = imageUrl;
      await website.save();

      res.json({
        success: true,
        imageUrl,
        message: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ 
        message: 'Failed to upload image',
        error: error.message 
      });
    }
  }
];

exports.createWebsiteWithCategories = [authenticateToken, async (req, res) => {
  try {
    const { websiteName, websiteLink, imageUrl, businessCategories, monthlyTraffic, verificationToken } = req.body;
    const ownerId = req.user.id.toString();

    if (!websiteName || !websiteLink || !businessCategories || !Array.isArray(businessCategories)) {
      return res.status(400).json({ 
        message: 'Website name, link, and business categories are required' 
      });
    }

    if (!verificationToken) {
      return res.status(400).json({
        message: 'Domain must be verified before creating a website. Please complete domain verification first.',
      });
    }

    if (businessCategories.length === 0) {
      return res.status(400).json({ 
        message: 'At least one business category must be selected' 
      });
    }

    // Double-check if website URL already exists (in case someone else created it while user was selecting categories)
    const existingWebsite = await Website.findOne({ websiteLink }).lean();
    if (existingWebsite) {
      return res.status(409).json({ message: 'Website URL already exists' });
    }

    // Re-verify TXT record server-side before saving (prevents token replay)
    const domain = normalizeDomain(websiteLink);
    const expectedTxt = buildTxtRecord(verificationToken);
    const lookupHost = `_yepper-challenge.${domain}`;

    let verified = false;
    try {
      const records = await dns.resolveTxt(lookupHost);
      verified = records.some(rdata => rdata.join('').includes(expectedTxt));
    } catch {
      verified = false;
    }

    if (!verified) {
      return res.status(400).json({
        message: 'Domain ownership could not be re-confirmed. Please re-verify your domain and try again.',
        code: 'DOMAIN_VERIFICATION_FAILED',
      });
    }

    // Validate business categories against allowed enum values
    const allowedCategories = [
      'any', 'technology', 'food-beverage', 'real-estate', 'automotive',
      'health-wellness', 'entertainment', 'fashion', 'education',
      'business-services', 'travel-tourism', 'arts-culture', 'photography',
      'gifts-events', 'government-public', 'general-retail'
    ];

    const invalidCategories = businessCategories.filter(cat => !allowedCategories.includes(cat));
    if (invalidCategories.length > 0) {
      return res.status(400).json({ 
        message: `Invalid business categories: ${invalidCategories.join(', ')}` 
      });
    }

    // Now create and save the website
    const newWebsite = new Website({
      ownerId,
      websiteName,
      websiteLink,
      imageUrl: imageUrl || '',
      businessCategories,
      isBusinessCategoriesSelected: true,
      monthlyTraffic: parseInt(monthlyTraffic) || 0,
      trafficTier: computeTrafficTier(monthlyTraffic),
      verificationToken,
      verificationStatus: 'verified',
      verifiedAt: new Date(),
    });

    const savedWebsite = await newWebsite.save();

    console.log('Website created successfully with ID:', savedWebsite._id);

    res.status(201).json({
      success: true,
      data: savedWebsite.toObject(),
      message: 'Website created successfully'
    });
  } catch (error) {
    console.error('Error creating website with categories:', error);
    res.status(500).json({ 
      message: 'Failed to create website',
      error: error.message 
    });
  }
}];

exports.createWebsite = [upload.single('file'), authenticateToken, async (req, res) => {
  try {
    const { websiteName, websiteLink } = req.body;
    const ownerId = req.user.id.toString();

    if (!websiteName || !websiteLink) {
      return res.status(400).json({ message: 'Website name and link are required' });
    }

    const existingWebsite = await Website.findOne({ websiteLink }).lean();
    if (existingWebsite) {
      return res.status(409).json({ message: 'Website URL already exists' });
    }

    let imageUrl = '';

    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file);
      } catch (uploadError) {
        console.error('File upload failed:', uploadError);
        return res.status(500).json({ 
          message: 'Failed to upload file. Please try again.',
          error: uploadError.message 
        });
      }
    }

    const newWebsite = new Website({
      ownerId,
      websiteName,
      websiteLink,
      imageUrl,
      businessCategories: [],
      isBusinessCategoriesSelected: false
    });

    const savedWebsite = await newWebsite.save();

    res.status(201).json({
      ...savedWebsite.toObject(),
      nextStep: 'business-categories'
    });
  } catch (error) {
    console.error('Error creating website:', error);
    res.status(500).json({ 
      message: 'Failed to create website',
      error: error.message 
    });
  }
}];

exports.updateWebsiteName = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { websiteName } = req.body;

    // Validate input
    if (!websiteId || !websiteName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Find and update the website
    const updatedWebsite = await Website.findByIdAndUpdate(
      websiteId, 
      { websiteName }, 
      { new: true, runValidators: true }
    );

    // Check if website exists
    if (!updatedWebsite) {
      return res.status(404).json({ message: 'Website not found' });
    }

    res.status(200).json(updatedWebsite);
  } catch (error) {
    console.error('Error updating website name:', error);
    res.status(500).json({ 
      message: 'Failed to update website name',
      error: error.message 
    });
  }
};

exports.getAllWebsites = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;  // Pagina tion parameters
  try {
    const websites = await Website.find()
      .lean()  // Use lean for performance
      .select('ownerId websiteName websiteLink imageUrl businessCategories createdAt');  // Include businessCategories

    // Ensure all websites have businessCategories as an array
    const sanitizedWebsites = websites.map(website => ({
      ...website,
      businessCategories: Array.isArray(website.businessCategories) 
        ? website.businessCategories 
        : [] // Default to empty array if not set
    }));

    res.status(200).json(sanitizedWebsites);
  } catch (error) {
    console.error('Error fetching websites:', error);
    res.status(500).json({ message: 'Failed to fetch websites', error: error.message });
  }
};

exports.getWebsitesByOwner = async (req, res) => {
  const { ownerId } = req.params;
  try {
    const websites = await Website.find({ ownerId })
      .lean()
      .select('ownerId websiteName websiteLink imageUrl createdAt');
    res.status(200).json(websites);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch websites', error });
  }
};

exports.getWebsiteById = async (req, res) => {
  const { websiteId } = req.params;
  try {
    const website = await Website.findById(websiteId).lean();  // Use lean for fast loading
    if (!website) {
      return res.status(404).json({ message: 'Website not found' });
    }
    res.status(200).json(website);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch website', error });
  }
};