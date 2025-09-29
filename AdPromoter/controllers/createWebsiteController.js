// createWebsiteController.js
const Website = require('../models/CreateWebsiteModel');
const multer = require('multer');
const User = require('../../models/User'); // CHANGE: Added User model import for custom auth
const path = require('path');
const jwt = require('jsonwebtoken'); // ADD THIS LINE - Missing import
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

const credentials = {
  type: 'service_account',
  project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
  private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLOUD_CLIENT_EMAIL)}`
};

// Initialize storage with credentials object and timeout settings
const storage = new Storage({
  credentials,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  timeout: 60000, // 60 seconds timeout
  maxRetries: 3,
  retryOptions: {
    autoRetry: true,
    maxRetries: 3,
    retryDelayMultiplier: 2,
    totalTimeout: 60000,
    maxRetryDelay: 10000
  }
});

const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;

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

const uploadToGCS = async (file) => {
  try {
    console.log('Starting GCS upload for:', file.originalname);
    
    const bucket = storage.bucket(bucketName);
    const fileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    // Create file in bucket
    const cloudFile = bucket.file(fileName);
    
    // Use simple upload instead of resumable for smaller files
    const stream = cloudFile.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        cacheControl: 'public, max-age=31536000'
      },
      public: true,
      validation: false, // Disable validation for faster upload
      resumable: false // Use simple upload for files under 5MB
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('Upload timeout after 30 seconds'));
      }, 30000);

      stream.on('error', (error) => {
        clearTimeout(timeout);
        console.error('Stream error:', error);
        reject(error);
      });

      stream.on('finish', async () => {
        clearTimeout(timeout);
        try {
          // Make file public
          await cloudFile.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
          console.log('File uploaded successfully to:', publicUrl);
          resolve(publicUrl);
        } catch (error) {
          console.error('Error making file public:', error);
          reject(error);
        }
      });

      stream.end(file.buffer);
    });

  } catch (error) {
    console.error('GCS upload error:', error);
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

exports.prepareWebsite = [upload.single('file'), authenticateToken, async (req, res) => {
  try {
    const { websiteName, websiteLink } = req.body;
    const ownerId = req.user._id.toString();

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
        
        imageUrl = await uploadToGCS(req.file);
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

exports.createWebsiteWithCategories = [authenticateToken, async (req, res) => {
  try {
    const { websiteName, websiteLink, imageUrl, businessCategories } = req.body;
    const ownerId = req.user._id.toString();

    if (!websiteName || !websiteLink || !businessCategories || !Array.isArray(businessCategories)) {
      return res.status(400).json({ 
        message: 'Website name, link, and business categories are required' 
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

    // Now create and save the website (imageUrl is already uploaded from prepareWebsite step)
    const newWebsite = new Website({
      ownerId,
      websiteName,
      websiteLink,
      imageUrl: imageUrl || '', // Use the imageUrl from prepareWebsite step
      businessCategories,
      isBusinessCategoriesSelected: true
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
    const ownerId = req.user._id.toString();

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
        imageUrl = await uploadToGCS(req.file);
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