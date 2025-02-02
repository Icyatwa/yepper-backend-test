// RequestAdController.js
const RequestAd = require('../models/RequestAdModel');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Set up multer storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|pdf|mp4/;
    const mimeType = fileTypes.test(file.mimetype);
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimeType && extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  }
});

exports.createRequestAd = [upload.single('file'), async (req, res) => {
    try {
        const {
            userId,
            categories,
            businessName,
            businessWebsite,
            businessLocation,
            businessContacts,
            adDescription,
        } = req.body;
    
        let imageUrl = '';
        let pdfUrl = '';
        let videoUrl = '';
    
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const filePath = path.join(__dirname, '../uploads', fileName);
    
            if (req.file.mimetype.startsWith('image')) {
                await sharp(req.file.buffer)
                    .resize(300, 300)
                    .toFile(filePath);
                imageUrl = `/uploads/${fileName}`;
            } else {
                await fs.promises.writeFile(filePath, req.file.buffer);
                if (req.file.mimetype === 'application/pdf') {
                    pdfUrl = `/uploads/${fileName}`;
                } else if (req.file.mimetype.startsWith('video')) {
                    videoUrl = `/uploads/${fileName}`;
                }
            }
        }
    
        const newRequestAd = new RequestAd({
            userId,
            imageUrl,
            pdfUrl,
            videoUrl,
            categories,
            businessName,
            businessWebsite,
            businessLocation,
            businessContacts,
            adDescription,
        });
    
        const savedRequestAd = await newRequestAd.save();
        res.status(201).json(savedRequestAd);
    } catch (error) {
      console.error('MongoDB Error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
}];

exports.getAllAds = async (req, res) => {
  try {
    const ads = await RequestAd.find();
    res.status(200).json(ads);
  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getAdByIds = async (req, res) => {
    const adId = req.params.id;

    try {
        const ad = await RequestAd.findById(adId);
        if (!ad) {
            return res.status(404).json({ message: 'Ad not found' });
        }
        res.status(200).json(ad);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

exports.getAdsByUserId = async (req, res) => {
    const userId = req.params.userId;
    try {
        const ads = await RequestAd.find({ userId });
        if (!ads || ads.length === 0) {
            return res.status(404).json({ message: 'No ads found for this user' });
        }
        res.status(200).json(ads);
    } catch (error) {
        console.error('Error fetching ad by user ID:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
