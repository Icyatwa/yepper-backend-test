// WebsiteController.js
const Website = require('../models/WebsiteModel');
const multer = require('multer');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();
const Referral = require('../models/Referral'); // Add this import

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

// exports.createWebsite = [upload.single('file'), async (req, res) => {
//   try {
//     const { ownerId, websiteName, websiteLink } = req.body;

//     if (!ownerId || !websiteName || !websiteLink) {
//       return res.status(400).json({ message: 'Missing required fields' });
//     }

//     const existingWebsite = await Website.findOne({ websiteLink }).lean();
//     if (existingWebsite) {
//       return res.status(409).json({ message: 'Website URL already exists' });
//     }

//     let imageUrl = '';

//     if (req.file) {
//       try {
//         console.log('Starting file upload...');
//         console.log('File details:', {
//           originalname: req.file.originalname,
//           mimetype: req.file.mimetype,
//           size: req.file.size
//         });
        
//         imageUrl = await uploadToGCS(req.file);
//         console.log('Upload successful, URL:', imageUrl);
//       } catch (uploadError) {
//         console.error('File upload failed:', uploadError);
//         return res.status(500).json({ 
//           message: 'Failed to upload file',
//           error: uploadError.message 
//         });
//       }
//     }

//     const newWebsite = new Website({
//       ownerId,
//       websiteName,
//       websiteLink,
//       imageUrl
//     });

//     const savedWebsite = await newWebsite.save();

//     const referral = await Referral.findOne({ 
//       referredUserId: ownerId,
//       status: { $in: ['pending', 'website_created'] }
//     });

//     if (referral) {
//       // Update referral with website info
//       referral.status = 'website_created';
//       referral.websiteDetails.push({
//         websiteId: savedWebsite._id,
//         websiteName: savedWebsite.websiteName,
//         websiteLink: savedWebsite.websiteLink,
//         createdAt: new Date()
//       });
//       referral.lastUpdated = new Date();
//       await referral.save();
//     }

//     res.status(201).json(savedWebsite);
//   } catch (error) {
//     console.error('Error creating website:', error);
//     res.status(500).json({ 
//       message: 'Failed to create website',
//       error: error.message 
//     });
//   }
// }];

exports.createWebsite = [upload.single('file'), async (req, res) => {
  try {
    // Get ownerId from auth middleware (now using new Clerk SDK)
    const ownerId = req.auth?.userId;
    const { websiteName, websiteLink } = req.body;

    console.log('Creating website for user:', ownerId);
    console.log('Website data:', { websiteName, websiteLink });

    if (!ownerId) {
      return res.status(401).json({ 
        message: 'User not authenticated',
        tokenExpired: true 
      });
    }

    if (!websiteName || !websiteLink) {
      return res.status(400).json({ 
        message: 'Missing required fields: websiteName and websiteLink are required' 
      });
    }

    // Validate URL format
    try {
      new URL(websiteLink);
    } catch (urlError) {
      return res.status(400).json({ 
        message: 'Invalid website URL format' 
      });
    }

    const existingWebsite = await Website.findOne({ websiteLink }).lean();
    if (existingWebsite) {
      return res.status(409).json({ 
        message: 'Website URL already exists' 
      });
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
      imageUrl
    });

    const savedWebsite = await newWebsite.save();
    console.log('Website created successfully:', savedWebsite._id);

    // Handle referral logic
    try {
      const referral = await Referral.findOne({ 
        referredUserId: ownerId,
        status: { $in: ['pending', 'website_created'] }
      });

      if (referral) {
        referral.status = 'website_created';
        referral.websiteDetails.push({
          websiteId: savedWebsite._id,
          websiteName: savedWebsite.websiteName,
          websiteLink: savedWebsite.websiteLink,
          createdAt: new Date()
        });
        referral.lastUpdated = new Date();
        await referral.save();
        console.log('Referral updated for user:', ownerId);
      }
    } catch (referralError) {
      console.error('Error updating referral:', referralError);
      // Don't fail the request if referral update fails
    }

    res.status(201).json(savedWebsite);
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
  try {
    // Get user email from the authenticated request (set by middleware)
    const currentUserEmail = req.userEmail;
    
    console.log('Current user email from auth:', currentUserEmail);
    
    if (!currentUserEmail) {
      return res.status(401).json({ 
        message: 'User authentication required' 
      });
    }

    const TEST_ACCOUNT_EMAIL = 'olympusexperts@gmail.com';
    
    let query = {};
    
    // If current user is NOT the test account, exclude test account websites
    if (currentUserEmail !== TEST_ACCOUNT_EMAIL) {
      query.ownerId = { $ne: TEST_ACCOUNT_EMAIL };
      console.log('Non-test user - excluding test websites');
    } else {
      console.log('Test user - showing all websites');
      // If current user IS the test account, show all websites (no filter)
    }
    
    console.log('Query being used:', query);
    
    const websites = await Website.find(query)
      .lean()
      .select('ownerId websiteName websiteLink imageUrl createdAt category')
      .sort({ createdAt: -1 }); // Sort by newest first

    console.log('Websites found:', websites.length);
    
    res.status(200).json(websites);
  } catch (error) {
    console.error('Error fetching websites:', error);
    res.status(500).json({ 
      message: 'Failed to fetch websites', 
      error: error.message 
    });
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