// const ImportAd = require('../models/ImportAdModel');
// const multer = require('multer');
// const path = require('path');
// const bucket = require('../config/storage');

// const upload = multer({
//   storage: multer.memoryStorage(),
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|mp4|avi|mov|mkv|webm|pdf/;
//     const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     if (isValid) return cb(null, true);
//     cb(new Error('Invalid file type.'));
//   },
// });

// exports.createImportAd = [upload.single('file'), async (req, res) => {
//   try {
//     const {
//       userId,
//       adOwnerEmail,
//       businessName,
//       businessLink,
//       businessLocation,
//       adDescription,
//       selectedWebsites,
//       selectedCategories,
//       // selectedSpaces,
//     } = req.body;

//     const websitesArray = JSON.parse(selectedWebsites);
//     const categoriesArray = JSON.parse(selectedCategories);
//     // const spacesArray = JSON.parse(selectedSpaces);

//     let imageUrl = '';
//     let videoUrl = '';

//     // Upload file to GCS if provided
//     if (req.file) {
//       const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
//       const blobStream = blob.createWriteStream({
//         resumable: false,
//         contentType: req.file.mimetype,
//       });

//       await new Promise((resolve, reject) => {
//         blobStream.on('error', (err) => {
//           console.error('Upload error:', err);
//           reject(new Error('Failed to upload file.'));
//         });

//         blobStream.on('finish', async () => {
//           try {
//             console.log('File upload finished, attempting to make public...');
//             await blob.makePublic();
//             console.log('File made public successfully');
//             const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
//             if (req.file.mimetype.startsWith('image')) {
//               imageUrl = publicUrl;
//             } else if (req.file.mimetype.startsWith('video')) {
//               videoUrl = publicUrl;
//             }
//             resolve();
//           } catch (err) {
//             console.error('Error making file public:', err.message);
//             reject(new Error('Failed to make file public.'));
//           }
//         });
        

//         blobStream.end(req.file.buffer);
//       });
//     }

//     // Create new ad entry
//     const newRequestAd = new ImportAd({
//       userId,
//       adOwnerEmail,
//       imageUrl,
//       videoUrl,
//       businessName,
//       businessLink,
//       businessLocation,
//       adDescription,
//       selectedWebsites: websitesArray,
//       selectedCategories: categoriesArray,
//       // selectedSpaces: spacesArray,
//     });

//     const savedRequestAd = await newRequestAd.save();
//     res.status(201).json(savedRequestAd);
//   } catch (err) {
//     console.error('Error creating ad:', err);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// }];

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

// exports.getAdsByUserId = async (req, res) => {
//   const userId = req.params.userId;

//   try {
//     const ads = await ImportAd.find({ userId })
//       .lean()  // Faster data retrieval
//       .select('businessName businessLink businessLocation adDescription imageUrl pdfUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces');

//     if (!ads.length) {
//       return res.status(404).json({ message: 'No ads found for this user' });
//     }

//     res.status(200).json(ads);
//   } catch (error) {
//     console.error('Error fetching ads by user ID:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// };

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




















































// // // ImportAdController.js
// // const ImportAd = require('../models/ImportAdModel');
// // const AdSpace = require('../models/AdSpaceModel');
// // const multer = require('multer');
// // const sharp = require('sharp');
// // const path = require('path');
// // const fs = require('fs');
// // const sendEmailNotification = require('./emailService');

// // const storage = multer.memoryStorage();
// // const upload = multer({
// //   storage: storage,
// //   fileFilter: (req, file, cb) => {
// //     const imageTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg/;
// //     const videoTypes = /mp4|avi|mov|mkv|webm/; // Add supported video formats here
// //     const isImage = imageTypes.test(file.mimetype) && imageTypes.test(path.extname(file.originalname).toLowerCase());
// //     const isVideo = videoTypes.test(file.mimetype) && videoTypes.test(path.extname(file.originalname).toLowerCase());

// //     if (isImage || isVideo) {
// //       return cb(null, true);
// //     }
// //     cb(new Error('Invalid file type. Please upload an image or video file.'));
// //   },
// // });

// // exports.createImportAd = [upload.single('file'), async (req, res) => {
// //   try {
// //     const {
// //       userId,
// //       adOwnerEmail,
// //       businessName,
// //       businessLink,
// //       businessLocation,
// //       adDescription,
// //       selectedWebsites,
// //       selectedCategories,
// //       selectedSpaces,
// //     } = req.body;

// //     // Parse JSON strings
// //     const websitesArray = JSON.parse(selectedWebsites);
// //     const categoriesArray = JSON.parse(selectedCategories);
// //     const spacesArray = JSON.parse(selectedSpaces);

// //     let imageUrl = '';
// //     let pdfUrl = '';
// //     let videoUrl = '';

// //     // Process uploaded file
// //     if (req.file) {
// //       const fileName = `${Date.now()}-${req.file.originalname}`;
// //       const filePath = path.join(__dirname, '../uploads', fileName);

// //       if (req.file.mimetype.startsWith('image')) {
// //         await sharp(req.file.buffer).resize(300, 300).toFile(filePath);
// //         imageUrl = `/uploads/${fileName}`;
// //       } else {
// //         await fs.promises.writeFile(filePath, req.file.buffer);
// //         if (req.file.mimetype === 'application/pdf') {
// //           pdfUrl = `/uploads/${fileName}`;
// //         } else if (req.file.mimetype.startsWith('video')) {
// //           videoUrl = `/uploads/${fileName}`;
// //         }
// //       }
// //     }

// //     // Create ImportAd entry
// //     const newRequestAd = new ImportAd({
// //       userId,
// //       adOwnerEmail,
// //       imageUrl,
// //       pdfUrl,
// //       videoUrl,
// //       businessName,
// //       businessLink,
// //       businessLocation,
// //       adDescription,
// //       selectedWebsites: websitesArray,
// //       selectedCategories: categoriesArray,
// //       selectedSpaces: spacesArray,
// //       approved: false,
// //       confirmed: false
// //     });

// //     const savedRequestAd = await newRequestAd.save();

// //     // Get the ad spaces that the ad owner selected
// //     const adSpaces = await AdSpace.find({ _id: { $in: spacesArray } });

// //     // Push this ad to the selected spaces
// //     await AdSpace.updateMany(
// //       { _id: { $in: spacesArray } }, 
// //       { $push: { selectedAds: savedRequestAd._id } }
// //     );

// //     // Notify each web owner via email
// //     for (const space of adSpaces) {
// //       const emailBody = `
// //         <h2>New Ad Request for Your Ad Space</h2>
// //         <p>Hello,</p>
// //         <p>An advertiser has selected your ad space. Please review and approve the ad.</p>
// //         <p><strong>Business Name:</strong> ${businessName}</p>
// //         <p><strong>Description:</strong> ${adDescription}</p>
// //       `;
// //       await sendEmailNotification(space.webOwnerEmail, 'New Ad Request for Your Space', emailBody);
// //     }

// //     res.status(201).json(savedRequestAd);
// //   } catch (error) {
// //     console.error('Error importing ad:', error);
// //     res.status(500).json({ message: 'Internal Server Error' });
// //   }
// // }];










// // ImportAdController.js
// const ImportAd = require('../models/ImportAdModel');
// const AdSpace = require('../models/AdSpaceModel');
// const multer = require('multer');
// const path = require('path');
// const bucket = require('../config/storage');

// const upload = multer({
//   storage: multer.memoryStorage(),
//   fileFilter: (req, file, cb) => {
//     const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|mp4|avi|mov|mkv|webm|pdf/;
//     const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     if (isValid) return cb(null, true);
//     cb(new Error('Invalid file type.'));
//   },
// });

// exports.createImportAd = [upload.single('file'), async (req, res) => {
//   try {
//     const {
//       userId,
//       adOwnerEmail,
//       businessName,
//       businessLink,
//       businessLocation,
//       adDescription,
//       selectedWebsites,
//       selectedCategories,
//       selectedSpaces,
//     } = req.body;

//     const websitesArray = JSON.parse(selectedWebsites);
//     const categoriesArray = JSON.parse(selectedCategories);
//     const spacesArray = JSON.parse(selectedSpaces);

//     let imageUrl = '';
//     let videoUrl = '';

//     // Upload file to GCS if provided
//     if (req.file) {
//       const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
//       const blobStream = blob.createWriteStream({
//         resumable: false,
//         contentType: req.file.mimetype,
//       });

//       await new Promise((resolve, reject) => {
//         blobStream.on('error', (err) => {
//           console.error('Upload error:', err);
//           reject(new Error('Failed to upload file.'));
//         });

//         blobStream.on('finish', async () => {
//           try {
//             console.log('File upload finished, attempting to make public...');
//             await blob.makePublic();
//             console.log('File made public successfully');
//             const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
//             if (req.file.mimetype.startsWith('image')) {
//               imageUrl = publicUrl;
//             } else if (req.file.mimetype.startsWith('video')) {
//               videoUrl = publicUrl;
//             }
//             resolve();
//           } catch (err) {
//             console.error('Error making file public:', err.message);
//             reject(new Error('Failed to make file public.'));
//           }
//         });
        

//         blobStream.end(req.file.buffer);
//       });
//     }

//     // Create new ad entry
//     const newRequestAd = new ImportAd({
//       userId,
//       adOwnerEmail,
//       imageUrl,
//       videoUrl,
//       businessName,
//       businessLink,
//       businessLocation,
//       adDescription,
//       selectedWebsites: websitesArray,
//       selectedCategories: categoriesArray,
//       selectedSpaces: spacesArray,
//     });

//     const savedRequestAd = await newRequestAd.save();
//     res.status(201).json(savedRequestAd);
//   } catch (err) {
//     console.error('Error creating ad:', err);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// }];









// exports.getAdsByUserId = async (req, res) => {
//   const userId = req.params.userId;

//   try {
//     const ads = await ImportAd.find({ userId })
//       .lean()
//       .select(
//         'businessName businessLink businessLocation adDescription imageUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces'
//       );

//     res.status(200).json(ads);
//   } catch (err) {
//     console.error('Error fetching ads:', err);
//     res.status(500).json({ error: 'Failed to fetch ads' });
//   }
// };

// exports.getAllAds = async (req, res) => {
//   try {
//     const ads = await ImportAd.find();
//     res.status(200).json(ads);
//   } catch (error) {
//     console.error('Error fetching ads:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// };

// exports.getAdByIds = async (req, res) => {
//   const adId = req.params.id;

//   try {
//     const ad = await ImportAd.findById(adId)
//       .lean()  // Faster loading
//       .select('businessName businessLink businessLocation adDescription imageUrl pdfUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces');

//     if (!ad) {
//       return res.status(404).json({ message: 'Ad not found' });
//     }
//     res.status(200).json(ad);
//   } catch (error) {
//     console.error('Error fetching ad by ID:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// };

// // exports.getAdsByUserId = async (req, res) => {
// //   const userId = req.params.userId;

// //   try {
// //     const ads = await ImportAd.find({ userId })
// //       .lean()  // Faster data retrieval
// //       .select('businessName businessLink businessLocation adDescription imageUrl pdfUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces');

// //     if (!ads.length) {
// //       return res.status(404).json({ message: 'No ads found for this user' });
// //     }

// //     res.status(200).json(ads);
// //   } catch (error) {
// //     console.error('Error fetching ads by user ID:', error);
// //     res.status(500).json({ message: 'Internal Server Error' });
// //   }
// // };

// exports.getProjectsByUserId = async (req, res) => {
//   const userId = req.params.userId;

//   try {
//     const approvedAds = await ImportAd.find({ userId, approved: true })
//       .lean()
//       .populate('selectedWebsites', 'websiteName websiteLink')
//       .populate('selectedCategories', 'categoryName description')
//       .populate('selectedSpaces', 'spaceType price availability')
//       .select('businessName businessLink businessLocation adDescription imageUrl pdfUrl videoUrl approved selectedWebsites selectedCategories selectedSpaces');

//     const pendingAds = await ImportAd.find({ userId, approved: false })
//       .lean()
//       .populate('selectedWebsites', 'websiteName websiteLink')
//       .populate('selectedCategories', 'categoryName description')
//       .populate('selectedSpaces', 'spaceType price availability')
//       .select('businessName businessLink businessLocation adDescription approved selectedWebsites selectedCategories selectedSpaces');
      
//     res.status(200).json({
//       approvedAds,
//       pendingAds
//     });
//   } catch (error) {
//     console.error('Error fetching ads by user ID:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// };

// exports.getAdsByUserIdWithClicks = async (req, res) => {
//   const userId = req.params.userId;
//   try {
//     const ads = await ImportAd.find({ userId });
//     for (const ad of ads) {
//       const clicks = await AdClick.find({ adId: ad._id }).exec();
//       ad.clicks = clicks.length;
//       ad.websites = [...new Set(clicks.map(click => click.website))]; // Unique websites
//     }
//     res.status(200).json(ads);
//   } catch (error) {
//     console.error('Error fetching ads with clicks:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// };