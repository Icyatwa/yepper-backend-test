// createWebsiteController.js
const Website = require('../models/CreateWebsiteModel');
const multer = require('multer');
const User = require('../../models/User'); // CHANGE: Added User model import for custom auth
const path = require('path');
const jwt = require('jsonwebtoken'); // ADD THIS LINE - Missing import
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// Create credentials object from environment variables
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

// Initialize storage with credentials object
const storage = new Storage({
  credentials,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|avi|mov|mkv|webm/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type.'));
  },
});

const uploadToGCS = async (file) => {
  try {
    console.log('Initializing upload with credentials for:', credentials.client_email);
    
    const bucket = storage.bucket(bucketName);
    const fileName = `${Date.now()}-${file.originalname}`;
    
    // Create file in bucket
    const cloudFile = bucket.file(fileName);
    
    // Upload with promise
    await cloudFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
      public: true,
      validation: 'md5'
    });

    // Make file public
    await cloudFile.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    console.log('File uploaded successfully to:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Detailed upload error:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
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

    req.user = user; // CHANGE: Set user object instead of just userId
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

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
        console.log('Starting file upload...');
        console.log('File details:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
        
        imageUrl = await uploadToGCS(req.file);
        console.log('Upload successful, URL:', imageUrl);
      } catch (uploadError) {
        console.error('File upload failed:', uploadError);
        return res.status(500).json({ 
          message: 'Failed to upload file',
          error: uploadError.message 
        });
      }
    }

    const newWebsite = new Website({
      ownerId,
      websiteName,
      websiteLink,
      imageUrl,
      businessCategories: [], // Initialize empty array
      isBusinessCategoriesSelected: false // Not selected yet
    });

    const savedWebsite = await newWebsite.save();

    res.status(201).json({
      ...savedWebsite.toObject(),
      nextStep: 'business-categories' // Indicate next step for frontend
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
  const { page = 1, limit = 10 } = req.query;  // Pagination parameters
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