// createWebsiteController.js
const Website = require('../models/CreateWebsiteModel');
const multer = require('multer');
const User = require('../../models/User');
const path = require('path');
const jwt = require('jsonwebtoken');
const cloudinary = require('../../config/storage');
const dns = require('dns').promises;
const crypto = require('crypto');
require('dotenv').config();

function toClient(w) {
  if (!w) return null;
  return {
    ...w,
    _id: w.id,
    websiteName: w.website_name,
    websiteLink: w.website_link,
    monthlyTraffic: w.monthly_traffic,
    trafficTier: w.traffic_tier,
    siteScript: w.site_script,
    imageUrl: w.image_url,
    ownerId: w.owner_id,
    isBusinessCategoriesSelected: w.is_business_categories_selected,
    verificationStatus: w.verification_status,
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase()) &&
                    file.mimetype.startsWith('image/');
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type. Only image files are allowed.'));
  },
});

const uploadToCloudinary = async (file) => {
  const fileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'yepper_websites', public_id: fileName },
      (error, result) => {
        if (error) return reject(new Error(`Upload failed: ${error.message}`));
        resolve(result.secure_url);
      }
    );
    uploadStream.end(file.buffer);
  });
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token is required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

function computeTrafficTier(visitors) {
  const v = parseInt(visitors) || 0;
  if (v <= 2000) return 'starter';
  if (v <= 10000) return 'basic';
  if (v <= 50000) return 'standard';
  if (v <= 200000) return 'premium';
  return 'elite';
}

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

// POST /api/createWebsite/initiate-verification
exports.initiateVerification = [authenticateToken, async (req, res) => {
  try {
    const { websiteLink } = req.body;
    if (!websiteLink) return res.status(400).json({ message: 'websiteLink is required' });

    const domain = normalizeDomain(websiteLink);
    if (!domain) return res.status(400).json({ message: 'Invalid website URL' });

    // Reuse existing token if same owner already started for this domain
    const existing = await Website.findByLink(websiteLink);
    const token = (existing && existing.owner_id === req.user.id.toString() && existing.verification_status === 'pending')
      ? existing.verification_token
      : crypto.randomBytes(24).toString('hex');

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

// POST /api/createWebsite/verify-domain
exports.verifyDomain = [authenticateToken, async (req, res) => {
  try {
    const { websiteLink, verificationToken } = req.body;
    if (!websiteLink || !verificationToken) {
      return res.status(400).json({ message: 'websiteLink and verificationToken are required' });
    }

    const domain = normalizeDomain(websiteLink);
    if (!domain) return res.status(400).json({ message: 'Invalid website URL' });

    const expectedTxt = buildTxtRecord(verificationToken);
    const lookupHost = `_yepper-challenge.${domain}`;

    let found = false;
    try {
      const records = await dns.resolveTxt(lookupHost);
      found = records.some(rdata => rdata.join('').includes(expectedTxt));
    } catch {
      found = false;
    }

    if (!found) {
      return res.status(200).json({
        verified: false,
        message: `TXT record not found yet. Make sure you added "_yepper-challenge" with value "${expectedTxt}" to your DNS and allow a few minutes for propagation.`,
      });
    }

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

    const existingWebsite = await Website.findByLink(websiteLink);
    if (existingWebsite) return res.status(409).json({ message: 'Website URL already exists' });

    let imageUrl = '';
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file);
      } catch (uploadError) {
        return res.status(500).json({ message: 'Failed to upload file.', error: uploadError.message });
      }
    }

    res.status(200).json({
      ownerId,
      websiteName,
      websiteLink,
      imageUrl,
      tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      nextStep: 'business-categories',
    });
  } catch (error) {
    console.error('Error preparing website:', error);
    res.status(500).json({ message: 'Failed to prepare website', error: error.message });
  }
}];

exports.uploadWebsiteImage = [authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { websiteId } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const website = await Website.findById(websiteId);
    if (!website) return res.status(404).json({ message: 'Website not found' });
    if (website.owner_id !== req.user.id.toString()) return res.status(403).json({ message: 'Unauthorized' });

    const imageUrl = await uploadToCloudinary(req.file);
    await Website.update(websiteId, { imageUrl });

    res.json({ success: true, imageUrl, message: 'Image uploaded successfully' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Failed to upload image', error: error.message });
  }
}];

exports.createWebsiteWithCategories = [authenticateToken, async (req, res) => {
  try {
    const { websiteName, websiteLink, imageUrl, businessCategories, monthlyTraffic, verificationToken } = req.body;
    const ownerId = req.user.id.toString();

    if (!websiteName || !websiteLink || !businessCategories || !Array.isArray(businessCategories)) {
      return res.status(400).json({ message: 'Website name, link, and business categories are required' });
    }
    if (!verificationToken) {
      return res.status(400).json({ message: 'Domain must be verified before creating a website.' });
    }
    if (businessCategories.length === 0) {
      return res.status(400).json({ message: 'At least one business category must be selected' });
    }

    const existingWebsite = await Website.findByLink(websiteLink);
    if (existingWebsite) return res.status(409).json({ message: 'Website URL already exists' });

    // Re-verify TXT record before saving
    const domain = normalizeDomain(websiteLink);
    const expectedTxt = buildTxtRecord(verificationToken);
    let verified = false;
    try {
      const records = await dns.resolveTxt(`_yepper-challenge.${domain}`);
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

    const allowedCategories = [
      'any', 'technology', 'food-beverage', 'real-estate', 'automotive',
      'health-wellness', 'entertainment', 'fashion', 'education',
      'business-services', 'travel-tourism', 'arts-culture', 'photography',
      'gifts-events', 'government-public', 'general-retail'
    ];
    const invalidCategories = businessCategories.filter(cat => !allowedCategories.includes(cat));
    if (invalidCategories.length > 0) {
      return res.status(400).json({ message: `Invalid business categories: ${invalidCategories.join(', ')}` });
    }

    const savedWebsite = await Website.create({
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
    });

    console.log('Website created successfully with ID:', savedWebsite.id);
    res.status(201).json({ success: true, data: savedWebsite, message: 'Website created successfully' });
  } catch (error) {
    console.error('Error creating website with categories:', error);
    res.status(500).json({ message: 'Failed to create website', error: error.message });
  }
}];

exports.createWebsite = [upload.single('file'), authenticateToken, async (req, res) => {
  try {
    const { websiteName, websiteLink } = req.body;
    const ownerId = req.user.id.toString();

    if (!websiteName || !websiteLink) {
      return res.status(400).json({ message: 'Website name and link are required' });
    }

    const existingWebsite = await Website.findByLink(websiteLink);
    if (existingWebsite) return res.status(409).json({ message: 'Website URL already exists' });

    let imageUrl = '';
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file);
      } catch (uploadError) {
        return res.status(500).json({ message: 'Failed to upload file.', error: uploadError.message });
      }
    }

    const savedWebsite = await Website.create({
      ownerId,
      websiteName,
      websiteLink,
      imageUrl,
      businessCategories: [],
      isBusinessCategoriesSelected: false,
    });

    res.status(201).json({ ...savedWebsite, nextStep: 'business-categories' });
  } catch (error) {
    console.error('Error creating website:', error);
    res.status(500).json({ message: 'Failed to create website', error: error.message });
  }
}];

exports.updateWebsiteName = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { websiteName } = req.body;
    if (!websiteId || !websiteName) return res.status(400).json({ message: 'Missing required fields' });

    const updatedWebsite = await Website.update(websiteId, { websiteName });
    if (!updatedWebsite) return res.status(404).json({ message: 'Website not found' });

    res.status(200).json(updatedWebsite);
  } catch (error) {
    console.error('Error updating website name:', error);
    res.status(500).json({ message: 'Failed to update website name', error: error.message });
  }
};

exports.getAllWebsites = async (req, res) => {
  try {
    const websites = await Website.findAll();
    res.status(200).json(websites.map(w => ({ ...w, businessCategories: w.business_categories || [] })));
  } catch (error) {
    console.error('Error fetching websites:', error);
    res.status(500).json({ message: 'Failed to fetch websites', error: error.message });
  }
};

exports.getWebsitesByOwner = async (req, res) => {
  const { ownerId } = req.params;
  try {
    const websites = await Website.findByOwner(ownerId);
    res.status(200).json(websites.map(toClient));  // ← map
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch websites', error });
  }
};

exports.getWebsiteById = async (req, res) => {
  const { websiteId } = req.params;
  try {
    const website = await Website.findById(websiteId);
    if (!website) return res.status(404).json({ message: 'Website not found' });
    res.status(200).json(toClient(website));  // ← wrap
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch website', error });
  }
};