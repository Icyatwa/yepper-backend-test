const Website = require('../models/WebsiteModel');
const multer = require('multer');
const path = require('path'); 
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
  auth_uri: "*****",
  token_uri: "*****",
  auth_provider_x509_cert_url: "*****",
  client_x509_cert_url: `*****`
};

// Initialize storage with credentials and explicit token configuration
const storage = new Storage({
  credentials,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  auth: {
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    // Set explicit token lifetime
    clientOptions: {
      maxRetries: 3,
      jwt: {
        expiresIn: '1h', // Token expires in 1 hour
        issuer: credentials.client_email,
        subject: credentials.client_email
      }
    }
  }
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
    const cloudFile = bucket.file(fileName);
    
    // Upload with promise and retry logic
    const uploadOptions = {
      metadata: {
        contentType: file.mimetype,
      },
      public: true,
      validation: 'md5',
      resumable: false, // For smaller files, disable resumable uploads
      timeout: 30000, // 30 second timeout
      retries: 3 // Retry failed uploads 3 times
    };

    await cloudFile.save(file.buffer, uploadOptions);
    await cloudFile.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    console.log('File uploaded successfully to:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Detailed upload error:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      details: error.errors // Log additional error details if available
    });
    
    // Throw a more specific error based on the type of failure
    if (error.code === 401 || error.code === 403) {
      throw new Error('Authentication failed. Please check your credentials.');
    } else if (error.code === 404) {
      throw new Error('Bucket not found. Please check your bucket name.');
    } else {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }
};

exports.createWebsite = [upload.single('file'), async (req, res) => {
  try {
    const { ownerId, websiteName, websiteLink } = req.body;

    if (!ownerId || !websiteName || !websiteLink) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existingWebsite = await Website.findOne({ websiteLink }).lean();
    if (existingWebsite) {
      return res.status(409).json({ message: 'Website URL already exists' });
    }

    let imageUrl = '';

    if (req.file) {
      try {
        console.log('Starting file upload...', {
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
    res.status(201).json(savedWebsite);
  } catch (error) {
    console.error('Error creating website:', error);
    res.status(500).json({ 
      message: 'Failed to create website',
      error: error.message 
    });
  }
}];