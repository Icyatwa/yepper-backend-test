// // WebAdvertiseController.js
// const mongoose = require('mongoose');
// const multer = require('multer');
// const path = require('path');
// const cloudinary = require('../../config/storage');
// const ImportAd = require('../models/WebAdvertiseModel');
// const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
// const User = require('../../models/User');
// const Payment = require('../models/PaymentModel');

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
//       adOwnerEmail,
//       businessName,
//       businessLink,
//       businessLocation,
//       adDescription,
//       selectedWebsites, // CHANGE: Make optional
//       selectedCategories, // CHANGE: Make optional
//     } = req.body;

//     // CHANGE: Only businessName is required now
//     if (!businessName) {
//       return res.status(400).json({
//         error: 'Missing Required Fields',
//         message: 'businessName is required'
//       });
//     }

//     // CHANGE: Handle optional website/category selections
//     let websitesArray = [];
//     let categoriesArray = [];
    
//     if (selectedWebsites && selectedCategories) {
//       try {
//         websitesArray = typeof selectedWebsites === 'string' 
//           ? JSON.parse(selectedWebsites) 
//           : selectedWebsites;
//         categoriesArray = typeof selectedCategories === 'string' 
//           ? JSON.parse(selectedCategories) 
//           : selectedCategories;
//       } catch (parseError) {
//         console.error('JSON parsing error:', parseError);
//         return res.status(400).json({
//           error: 'Invalid Data Format',
//           message: 'selectedWebsites and selectedCategories must be valid JSON arrays'
//         });
//       }

//       // Validate arrays only if provided
//       if (!Array.isArray(websitesArray) || !Array.isArray(categoriesArray)) {
//         return res.status(400).json({
//           error: 'Invalid Data Type',
//           message: 'selectedWebsites and selectedCategories must be arrays'
//         });
//       }
//     }

//     console.log('Parsed arrays:', { websitesArray, categoriesArray });

//     // File upload logic remains the same...
//     let imageUrl = '';
//     let videoUrl = '';
//     let pdfUrl = '';

//     if (req.file) {
//       const resourceType = req.file.mimetype.startsWith('video')
//         ? 'video'
//         : req.file.mimetype === 'application/pdf'
//         ? 'raw'
//         : 'image';

//       const publicUrl = await new Promise((resolve, reject) => {
//         const uploadStream = cloudinary.uploader.upload_stream(
//           {
//             resource_type: resourceType,
//             folder: 'yepper_ads',
//             public_id: `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
//           },
//           (error, result) => {
//             if (error) return reject(new Error('Failed to upload file.'));
//             resolve(result.secure_url);
//           }
//         );
//         uploadStream.end(req.file.buffer);
//       });

//       if (req.file.mimetype.startsWith('image')) {
//         imageUrl = publicUrl;
//       } else if (req.file.mimetype.startsWith('video')) {
//         videoUrl = publicUrl;
//       } else if (req.file.mimetype === 'application/pdf') {
//         pdfUrl = publicUrl;
//       }
//     }

//     // CHANGE: Only fetch categories if selections exist
//     let categories = [];
//     let websiteSelections = [];
    
//     if (categoriesArray.length > 0) {
//       console.log('Fetching categories...');
//       try {
//         categories = await AdCategory.find({
//           _id: { $in: categoriesArray }
//         });
        
//         if (categories.length === 0) {
//           return res.status(404).json({
//             error: 'Categories Not Found',
//             message: 'No valid categories found for the provided IDs'
//           });
//         }
        
//         console.log(`Found ${categories.length} categories`);
//       } catch (categoryError) {
//         console.error('Category fetch error:', categoryError);
//         return res.status(500).json({
//           error: 'Database Error',
//           message: 'Failed to fetch categories'
//         });
//       }

//       // Create website-category mapping
//       const websiteCategoryMap = categories.reduce((map, category) => {
//         const websiteId = category.websiteId.toString();
//         if (!map.has(websiteId)) {
//           map.set(websiteId, []);
//         }
//         map.get(websiteId).push(category._id);
//         return map;
//       }, new Map());

//       console.log('Website-category mapping:', Object.fromEntries(websiteCategoryMap));

//       // Create website selections with validation
//       websiteSelections = websitesArray.map(websiteId => {
//         const websiteIdStr = websiteId.toString();
//         const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
        
//         const validCategories = categoriesArray.filter(categoryId => 
//           websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
//         );

//         return {
//           websiteId: websiteId,
//           categories: validCategories,
//           approved: false,
//           approvedAt: null,
//           status: 'pending'
//         };
//       }).filter(selection => selection.categories.length > 0);

//       if (websiteSelections.length === 0 && websitesArray.length > 0) {
//         return res.status(400).json({
//           error: 'Invalid Selection',
//           message: 'No valid website and category combinations found. Please ensure the selected categories belong to the selected websites.'
//         });
//       }

//       console.log('Valid website selections:', websiteSelections);
//     }

//     // User information handling remains the same...
//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;
//     if (!ownerId) {
//       return res.status(401).json({
//         error: 'Authentication Required',
//         message: 'User not authenticated'
//       });
//     }

//     let user;
//     try {
//       user = await User.findById(ownerId);
//       if (!user) {
//         return res.status(404).json({
//           error: 'User Not Found',
//           message: 'Authenticated user not found in database'
//         });
//       }
//     } catch (userError) {
//       console.error('User fetch error:', userError);
//       return res.status(500).json({
//         error: 'Database Error',
//         message: 'Failed to fetch user information'
//       });
//     }

//     const userId = user._id.toString();
//     console.log('Creating ad for user:', userId);

//     // Create new ad
//     const newRequestAd = new ImportAd({
//       userId,
//       adOwnerEmail: adOwnerEmail || user.email,
//       imageUrl,
//       videoUrl,
//       pdfUrl,
//       businessName,
//       businessLink,
//       businessLocation,
//       adDescription,
//       websiteSelections, // CHANGE: Can be empty array
//       confirmed: true, // CHANGE: Always true since basic info is complete
//       clicks: 0,
//       views: 0
//     });

//     // Save ad with error handling - same logic
//     let savedRequestAd;
//     try {
//       savedRequestAd = await newRequestAd.save();
//       console.log('Ad saved successfully:', savedRequestAd._id);
//     } catch (saveError) {
//       console.error('Ad save error:', saveError);
//       return res.status(500).json({
//         error: 'Database Error',
//         message: `Failed to save ad: ${saveError.message}`
//       });
//     }

//     // Populate ad data with error handling - same logic
//     let populatedAd;
//     try {
//       populatedAd = await ImportAd.findById(savedRequestAd._id)
//         .populate('websiteSelections.websiteId')
//         .populate('websiteSelections.categories');
      
//       if (!populatedAd) {
//         throw new Error('Failed to retrieve saved ad');
//       }
//     } catch (populateError) {
//       console.error('Population error:', populateError);
//       populatedAd = savedRequestAd;
//     }

//     // CHANGE: Conditional response based on whether website selections exist
//     if (websiteSelections.length > 0) {
//       // Create payment information - existing logic
//       const adWithPaymentInfo = {
//         ...populatedAd.toObject(),
//         paymentRequired: true,
//         paymentSelections: websiteSelections.map(selection => {
//           const category = categories.find(cat => 
//             selection.categories.includes(cat._id) && 
//             cat.websiteId.toString() === selection.websiteId.toString()
//           );
//           return {
//             websiteId: selection.websiteId,
//             categoryId: selection.categories[0],
//             price: category ? category.price : 0,
//             categoryName: category ? category.categoryName : 'Unknown',
//             websiteName: populatedAd.websiteSelections?.find(ws => 
//               ws.websiteId.toString() === selection.websiteId.toString()
//             )?.websiteId?.websiteName || 'Unknown'
//           };
//         })
//       };

//       console.log('Ad creation completed successfully with website selections');
      
//       res.status(201).json({
//         success: true,
//         data: adWithPaymentInfo,
//         message: 'Ad created successfully. Please proceed with payment to publish.'
//       });
//     } else {
//       // CHANGE: Response for basic ad creation without website selections
//       console.log('Basic ad creation completed successfully');
      
//       res.status(201).json({
//         success: true,
//         data: {
//           adId: populatedAd._id,
//           ...populatedAd.toObject(),
//           paymentRequired: false
//         },
//         message: 'Ad created successfully! You can add website selections later.'
//       });
//     }

//   } catch (err) {
//     console.error('Unexpected error in createImportAd:', err);
//     res.status(500).json({ 
//       error: 'Internal Server Error',
//       message: err.message,
//       stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
//     });
//   }
// }];

// exports.updateAdSelections = async (req, res) => {
//   try {
//     const { adId } = req.params;
//     const {
//       selectedWebsites,
//       selectedCategories,
//       // Optional: allow updating other fields
//       businessLink,
//       businessLocation,
//       adDescription
//     } = req.body;

//     // Validate required fields
//     if (!selectedWebsites || !selectedCategories) {
//       return res.status(400).json({
//         error: 'Missing Required Fields',
//         message: 'selectedWebsites and selectedCategories are required'
//       });
//     }

//     // Parse arrays
//     let websitesArray, categoriesArray;
//     try {
//       websitesArray = typeof selectedWebsites === 'string' 
//         ? JSON.parse(selectedWebsites) 
//         : selectedWebsites;
//       categoriesArray = typeof selectedCategories === 'string' 
//         ? JSON.parse(selectedCategories) 
//         : selectedCategories;
//     } catch (parseError) {
//       return res.status(400).json({
//         error: 'Invalid Data Format',
//         message: 'selectedWebsites and selectedCategories must be valid JSON arrays'
//       });
//     }

//     if (!Array.isArray(websitesArray) || !Array.isArray(categoriesArray)) {
//       return res.status(400).json({
//         error: 'Invalid Data Type',
//         message: 'selectedWebsites and selectedCategories must be arrays'
//       });
//     }

//     if (websitesArray.length === 0 || categoriesArray.length === 0) {
//       return res.status(400).json({
//         error: 'Empty Selection',
//         message: 'At least one website and category must be selected'
//       });
//     }

//     // Get the ad
//     const ad = await ImportAd.findById(adId);
//     if (!ad) {
//       return res.status(404).json({
//         error: 'Ad Not Found',
//         message: 'The specified ad does not exist'
//       });
//     }

//     // Verify ownership
//     const userId = req.user?.userId || req.user?.id || req.user?._id;
//     if (ad.userId !== userId) {
//       return res.status(403).json({
//         error: 'Unauthorized',
//         message: 'You do not have permission to update this ad'
//       });
//     }

//     // Check if ad already has website selections
//     if (ad.websiteSelections && ad.websiteSelections.length > 0) {
//       return res.status(400).json({
//         error: 'Ad Already Has Selections',
//         message: 'This ad already has website selections. Use the add more sites feature instead.'
//       });
//     }

//     // Fetch categories
//     const categories = await AdCategory.find({
//       _id: { $in: categoriesArray }
//     });
    
//     if (categories.length === 0) {
//       return res.status(404).json({
//         error: 'Categories Not Found',
//         message: 'No valid categories found for the provided IDs'
//       });
//     }

//     // Create website-category mapping
//     const websiteCategoryMap = categories.reduce((map, category) => {
//       const websiteId = category.websiteId.toString();
//       if (!map.has(websiteId)) {
//         map.set(websiteId, []);
//       }
//       map.get(websiteId).push(category._id);
//       return map;
//     }, new Map());

//     // Create website selections
//     const websiteSelections = websitesArray.map(websiteId => {
//       const websiteIdStr = websiteId.toString();
//       const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
      
//       const validCategories = categoriesArray.filter(categoryId => 
//         websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
//       );

//       return {
//         websiteId: websiteId,
//         categories: validCategories,
//         approved: false,
//         approvedAt: null,
//         status: 'pending'
//       };
//     }).filter(selection => selection.categories.length > 0);

//     if (websiteSelections.length === 0) {
//       return res.status(400).json({
//         error: 'Invalid Selection',
//         message: 'No valid website and category combinations found'
//       });
//     }

//     // Update the ad
//     const updateData = {
//       websiteSelections: websiteSelections,
//       confirmed: true
//     };

//     // Optionally update other fields if provided
//     if (businessLink) updateData.businessLink = businessLink;
//     if (businessLocation) updateData.businessLocation = businessLocation;
//     if (adDescription) updateData.adDescription = adDescription;

//     const updatedAd = await ImportAd.findByIdAndUpdate(
//       adId,
//       { $set: updateData },
//       { new: true }
//     ).populate('websiteSelections.websiteId')
//      .populate('websiteSelections.categories');

//     // Prepare payment info
//     const adWithPaymentInfo = {
//       ...updatedAd.toObject(),
//       paymentRequired: true,
//       paymentSelections: websiteSelections.map(selection => {
//         const category = categories.find(cat => 
//           selection.categories.includes(cat._id) && 
//           cat.websiteId.toString() === selection.websiteId.toString()
//         );
//         return {
//           websiteId: selection.websiteId,
//           categoryId: selection.categories[0],
//           price: category ? category.price : 0,
//           categoryName: category ? category.categoryName : 'Unknown',
//           websiteName: updatedAd.websiteSelections?.find(ws => 
//             ws.websiteId.toString() === selection.websiteId.toString()
//           )?.websiteId?.websiteName || 'Unknown'
//         };
//       })
//     };

//     res.status(200).json({
//       success: true,
//       data: adWithPaymentInfo,
//       message: 'Ad updated successfully. Please proceed with payment to publish.'
//     });

//   } catch (error) {
//     console.error('Update ad selections error:', error);
//     res.status(500).json({
//       error: 'Internal Server Error',
//       message: error.message
//     });
//   }
// };

// exports.getUserAds = async (req, res) => {
//   try {
//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    
//     const ads = await ImportAd.find({ userId: ownerId.toString() })
//       .populate('websiteSelections.websiteId')
//       .populate('websiteSelections.categories')
//       .sort({ createdAt: -1 });

//     res.status(200).json({
//       success: true,
//       data: ads
//     });

//   } catch (err) {
//     res.status(500).json({ 
//       error: 'Internal Server Error'
//     });
//   }
// };

// exports.getAd = async (req, res) => {
//   const { adId } = req.params;

//   try {
//     const ad = await ImportAd.findById(adId)
//       .populate({
//         path: 'websiteSelections.websiteId',
//         select: 'websiteName websiteLink'
//       })
//       .populate({
//         path: 'websiteSelections.categories',
//         select: 'categoryName price ownerId'
//       });

//     if (!ad) {
//       return res.status(404).json({ message: 'Ad not found' });
//     }

//     const adDetails = {
//       ...ad.toObject(),
//       totalPrice: ad.websiteSelections.reduce((sum, selection) => {
//         const categoryPriceSum = selection.categories.reduce((catSum, category) => 
//           catSum + (category.price || 0), 0);
//         return sum + categoryPriceSum;
//       }, 0),
//       websiteStatuses: ad.websiteSelections.map(selection => ({
//         websiteId: selection.websiteId._id,
//         websiteName: selection.websiteId.websiteName,
//         websiteLink: selection.websiteId.websiteLink,
//         categories: selection.categories,
//         approved: selection.approved,
//         confirmed: selection.confirmed || false,
//         approvedAt: selection.approvedAt
//       }))
//     };

//     res.status(200).json(adDetails);
//   } catch (error) {
//     console.error('Error fetching ad details:', error);
//     res.status(500).json({ message: 'Failed to fetch ad details', error: error.message });
//   }
// };

// exports.getAdDetails = async (req, res) => {
//   try {
//     const { adId } = req.params;
//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;

//     const ad = await ImportAd.findOne({ 
//       _id: adId, 
//       userId: ownerId.toString() 
//     })
//     .populate('websiteSelections.websiteId')
//     .populate('websiteSelections.categories');

//     if (!ad) {
//       return res.status(404).json({
//         error: 'Ad not found'
//       });
//     }

//     res.status(200).json({
//       success: true,
//       data: ad
//     });

//   } catch (err) {
//     res.status(500).json({ 
//       error: 'Internal Server Error'
//     });
//   }
// };

// exports.addWebsiteSelectionsToAd = async (req, res) => {
//   try {
//     const { adId } = req.params;
//     const { selectedWebsites, selectedCategories, isReassignment } = req.body;

//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    
//     // Find and verify ad ownership
//     const ad = await ImportAd.findOne({ _id: adId, userId: ownerId.toString() });

//     let websitesArray, categoriesArray;
//     try {
//       websitesArray = typeof selectedWebsites === 'string' 
//         ? JSON.parse(selectedWebsites) 
//         : selectedWebsites;
//       categoriesArray = typeof selectedCategories === 'string' 
//         ? JSON.parse(selectedCategories) 
//         : selectedCategories;
//     } catch (parseError) {
//       return res.status(400).json({
//         error: 'Invalid Data Format',
//         message: 'selectedWebsites and selectedCategories must be valid JSON arrays'
//       });
//     }

//     // Get categories with booking status check
//     const categories = await AdCategory.find({
//       _id: { $in: categoriesArray }
//     });

//     // Check for fully booked categories
//     const fullyBookedCategories = [];
//     const availableCategories = [];
    
//     for (const category of categories) {
//       const maxSlots = category.userCount || 10;
//       const currentSlots = category.selectedAds ? category.selectedAds.length : 0;
      
//       if (currentSlots >= maxSlots) {
//         fullyBookedCategories.push({
//           id: category._id,
//           name: category.categoryName,
//           currentSlots,
//           maxSlots
//         });
//       } else {
//         availableCategories.push(category);
//       }
//     }

//     // If some categories are fully booked, inform the user
//     if (fullyBookedCategories.length > 0) {
//       return res.status(409).json({
//         error: 'Some categories are fully booked',
//         message: 'The following categories are currently fully booked. Please select other categories.',
//         fullyBookedCategories: fullyBookedCategories,
//         availableCategories: availableCategories.map(cat => ({
//           id: cat._id,
//           name: cat.categoryName,
//           price: cat.price,
//           availableSlots: (cat.userCount || 10) - (cat.selectedAds?.length || 0)
//         }))
//       });
//     }

//     const websiteCategoryMap = availableCategories.reduce((map, category) => {
//       const websiteId = category.websiteId.toString();
//       if (!map.has(websiteId)) {
//         map.set(websiteId, []);
//       }
//       map.get(websiteId).push(category._id);
//       return map;
//     }, new Map());

//     const newWebsiteSelections = websitesArray.map(websiteId => {
//       const websiteIdStr = websiteId.toString();
//       const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
//       const validCategories = categoriesArray.filter(categoryId => 
//         websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
//       );

//       return {
//         websiteId: websiteId,
//         categories: validCategories,
//         approved: false,
//         approvedAt: null,
//         status: 'pending',
//         isRejected: false,
//         rejectedAt: null,
//         rejectionReason: null,
//         rejectedBy: null
//       };
//     }).filter(selection => selection.categories.length > 0);

//     // Selection logic for reassignments
//     let selectionsToAdd = [];
    
//     if (isReassignment) {
//       const websiteIdsToReassign = newWebsiteSelections.map(sel => sel.websiteId.toString());
//       ad.websiteSelections = ad.websiteSelections.filter(ws => 
//         !websiteIdsToReassign.includes(ws.websiteId.toString())
//       );
//       selectionsToAdd = newWebsiteSelections;
//     } else {
//       const existingActiveOrPendingWebsiteIds = ad.websiteSelections
//         .filter(ws => (ws.status === 'active' || ws.status === 'pending') && !ws.isRejected)
//         .map(ws => ws.websiteId.toString());
        
//       selectionsToAdd = newWebsiteSelections.filter(selection => 
//         !existingActiveOrPendingWebsiteIds.includes(selection.websiteId.toString())
//       );
//     }

//     if (selectionsToAdd.length === 0) {
//       return res.status(400).json({
//         error: isReassignment ? 'No valid reassignments to make' : 'No new website selections to add'
//       });
//     }

//     ad.websiteSelections.push(...selectionsToAdd);
    
//     const hasRejectedSelections = ad.websiteSelections.some(ws => ws.isRejected);
//     const hasActiveSelections = ad.websiteSelections.some(ws => ws.status === 'active' && !ws.isRejected);
//     ad.availableForReassignment = hasRejectedSelections && !hasActiveSelections;
    
//     await ad.save();

//     const populatedAd = await ImportAd.findById(adId)
//       .populate('websiteSelections.websiteId')
//       .populate('websiteSelections.categories');

//     // ENHANCED: Get advertiser's available refunds for smart payment calculation
//     const availableRefunds = await Payment.getAllAvailableRefunds(ownerId);

//     // ENHANCED: Smart refund distribution calculation
//     const paymentSelections = selectionsToAdd.map(selection => {
//       const category = availableCategories.find(cat => 
//         selection.categories.includes(cat._id) && 
//         cat.websiteId.toString() === selection.websiteId.toString()
//       );
      
//       return {
//         websiteId: selection.websiteId,
//         categoryId: selection.categories[0],
//         price: category ? category.price : 0,
//         categoryName: category ? category.categoryName : 'Unknown'
//       };
//     });

//     // ENHANCED: Calculate optimal refund distribution
//     const calculateRefundDistribution = (selections, totalRefunds) => {
//       // Sort selections by price (ascending) to maximize refund usage
//       const sortedSelections = [...selections].sort((a, b) => a.price - b.price);
//       let remainingRefunds = totalRefunds;
      
//       return selections.map(selection => {
//         const refundApplicable = Math.min(remainingRefunds, selection.price);
//         const remainingCost = Math.max(0, selection.price - refundApplicable);
//         remainingRefunds = Math.max(0, remainingRefunds - refundApplicable);
        
//         return {
//           ...selection,
//           availableRefund: refundApplicable,
//           remainingCost: remainingCost,
//           canUseRefundOnly: remainingCost === 0 && refundApplicable > 0
//         };
//       });
//     };

//     const enhancedPaymentSelections = calculateRefundDistribution(paymentSelections, availableRefunds);
    
//     // Calculate totals
//     const totalOriginalCost = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.price, 0);
//     const totalRefundSavings = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.availableRefund, 0);
//     const totalRemainingCost = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.remainingCost, 0);

//     res.status(200).json({
//       success: true,
//       message: isReassignment 
//         ? 'Ad reassigned successfully!' 
//         : 'Website selections added successfully!',
//       data: {
//         ad: populatedAd,
//         paymentRequired: true,
//         paymentSelections: enhancedPaymentSelections,
//         isReassignment,
//         totalAvailableRefunds: availableRefunds,
//         refundSavings: totalRefundSavings,
//         totalRemainingCost: totalRemainingCost,
//         totalOriginalCost: totalOriginalCost,
//         // ENHANCED: Add breakdown for better UI display
//         paymentBreakdown: {
//           originalTotal: totalOriginalCost,
//           refundApplied: totalRefundSavings,
//           finalAmountToPay: totalRemainingCost,
//           refundCoverage: totalOriginalCost > 0 ? (totalRefundSavings / totalOriginalCost) * 100 : 0
//         }
//       }
//     });

//   } catch (err) {
//     console.error('Error in addWebsiteSelectionsToAd:', err);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// exports.getAdsAvailableForReassignment = async (req, res) => {
//   try {
//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    
//     // Find ads that have rejected selections
//     const ads = await ImportAd.find({
//       userId: ownerId.toString(),
//       availableForReassignment: true
//     }).populate('websiteSelections.websiteId').populate('websiteSelections.categories');

//     // ENHANCED: Get total available refunds for the user
//     const totalAvailableRefunds = await Payment.getAllAvailableRefunds(ownerId);
    
//     // ENHANCED: Get detailed refund information
//     const refundDetails = await Payment.find({
//       advertiserId: ownerId,
//       status: 'refunded',
//       refundUsed: { $ne: true }
//     }).select('amount refundedAt refundReason adId').populate('adId', 'businessName');

//     const enrichedAds = ads.map(ad => {
//       const rejectedSelections = ad.websiteSelections.filter(ws => ws.isRejected);
//       const activeSelections = ad.websiteSelections.filter(ws => ws.status === 'active' && !ws.isRejected);
      
//       return {
//         ...ad.toObject(),
//         rejectedCount: rejectedSelections.length,
//         activeCount: activeSelections.length,
//         canReassign: rejectedSelections.length > 0,
//         rejectedSelections: rejectedSelections.map(sel => ({
//           websiteId: sel.websiteId._id,
//           websiteName: sel.websiteId.websiteName || 'Unknown Website',
//           rejectedAt: sel.rejectedAt,
//           rejectionReason: sel.rejectionReason,
//           categories: sel.categories
//         }))
//       };
//     });

//     res.status(200).json({
//       success: true,
//       data: {
//         ads: enrichedAds,
//         totalAvailableRefunds: totalAvailableRefunds,
//         refundCount: refundDetails.length,
//         refundDetails: refundDetails.map(refund => ({
//           amount: refund.amount,
//           refundedAt: refund.refundedAt,
//           reason: refund.refundReason,
//           businessName: refund.adId?.businessName || 'Unknown Business'
//         }))
//       }
//     });

//   } catch (error) {
//     console.error('Error getting ads available for reassignment:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// exports.getAdPaymentHistory = async (req, res) => {
//   try {
//     const { adId } = req.params;
//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;

//     // Verify ad ownership
//     const ad = await ImportAd.findOne({ _id: adId, userId: ownerId.toString() });
//     if (!ad) {
//       return res.status(404).json({ error: 'Ad not found or unauthorized' });
//     }

//     // Get all payments for this ad
//     const payments = await Payment.find({ adId: adId })
//       .populate('websiteId', 'websiteName')
//       .populate('categoryId', 'categoryName price')
//       .sort({ createdAt: -1 });

//     // ENHANCED: Categorize payments
//     const paymentHistory = {
//       successful: [],
//       refunded: [],
//       failed: [],
//       pending: []
//     };

//     const summary = {
//       totalSpent: 0,
//       totalRefunded: 0,
//       availableRefunds: 0,
//       successfulPayments: 0,
//       refundedPayments: 0
//     };

//     payments.forEach(payment => {
//       const paymentData = {
//         id: payment._id,
//         amount: payment.amount,
//         status: payment.status,
//         paymentMethod: payment.paymentMethod,
//         createdAt: payment.createdAt,
//         paidAt: payment.paidAt,
//         websiteName: payment.websiteId?.websiteName || 'Unknown',
//         categoryName: payment.categoryId?.categoryName || 'Unknown',
//         refundApplied: payment.refundApplied || 0,
//         amountPaid: payment.amountPaid || payment.amount
//       };

//       switch (payment.status) {
//         case 'successful':
//           paymentHistory.successful.push(paymentData);
//           summary.totalSpent += payment.amount;
//           summary.successfulPayments++;
//           break;
//         case 'refunded':
//         case 'internally_refunded':
//           paymentHistory.refunded.push({
//             ...paymentData,
//             refundedAt: payment.refundedAt,
//             refundReason: payment.refundReason,
//             refundUsed: payment.refundUsed || false
//           });
//           if (!payment.refundUsed) {
//             summary.availableRefunds += payment.amount;
//           }
//           summary.totalRefunded += payment.amount;
//           summary.refundedPayments++;
//           break;
//         case 'failed':
//           paymentHistory.failed.push(paymentData);
//           break;
//         case 'pending':
//           paymentHistory.pending.push(paymentData);
//           break;
//       }
//     });

//     res.status(200).json({
//       success: true,
//       data: {
//         adId: adId,
//         businessName: ad.businessName,
//         paymentHistory: paymentHistory,
//         summary: summary
//       }
//     });

//   } catch (error) {
//     console.error('Error getting ad payment history:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// exports.updateAdDetails = async (req, res) => {
//   try {
//     const { adId } = req.params;
//     const { businessName, businessLink, businessLocation, adDescription } = req.body;
//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;

//     const ad = await ImportAd.findOne({ _id: adId, userId: ownerId.toString() });
//     if (!ad) {
//       return res.status(404).json({ error: 'Ad not found or unauthorized' });
//     }

//     // Update fields if provided
//     if (businessName) ad.businessName = businessName;
//     if (businessLink) ad.businessLink = businessLink;
//     if (businessLocation) ad.businessLocation = businessLocation;
//     if (adDescription) ad.adDescription = adDescription;

//     await ad.save();

//     res.status(200).json({
//       success: true,
//       message: 'Ad updated successfully!',
//       data: ad
//     });

//   } catch (err) {
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// exports.getAvailableAdsForWebsite = async (req, res) => {
//   try {
//     const { websiteId } = req.params;
//     const ownerId = req.user?.userId || req.user?.id || req.user?._id;

//     // Find ads that are:
//     // 1. Available for reassignment (rejected or never selected this website)
//     // 2. Not created by this website owner
//     const availableAds = await ImportAd.find({
//       $and: [
//         { userId: { $ne: ownerId.toString() } }, // Not owned by current user
//         {
//           $or: [
//             { availableForReassignment: true }, // Marked as available after rejection
//             { 
//               websiteSelections: { 
//                 $not: { 
//                   $elemMatch: { 
//                     websiteId: websiteId,
//                     status: { $in: ['active', 'pending'] }
//                   } 
//                 } 
//               } 
//             } // Never selected this website or was rejected
//           ]
//         }
//       ]
//     }).populate('websiteSelections.websiteId');

//     res.status(200).json({
//       success: true,
//       data: availableAds
//     });

//   } catch (err) {
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };

// exports.selectAdForWebsite = async (req, res) => {
//   const session = await mongoose.startSession();
  
//   try {
//     const { adId, websiteId, categoryId } = req.body;
//     const websiteOwnerId = req.user?.userId || req.user?.id || req.user?._id;

//     await session.withTransaction(async () => {
//       // Verify website ownership through category
//       const category = await AdCategory.findOne({ 
//         _id: categoryId,
//         websiteId: websiteId,
//         ownerId: websiteOwnerId.toString() 
//       }).session(session);
      
//       if (!category) {
//         throw new Error('Category not found or unauthorized');
//       }

//       const ad = await ImportAd.findById(adId).session(session);
//       if (!ad) {
//         throw new Error('Ad not found');
//       }

//       // Check if already selected and active
//       const existingSelection = ad.websiteSelections.find(ws => 
//         ws.websiteId.toString() === websiteId.toString()
//       );

//       if (existingSelection && existingSelection.status === 'active') {
//         throw new Error('Ad already active on this website');
//       }

//       // Add or update website selection
//       if (existingSelection) {
//         existingSelection.categories = [categoryId];
//         existingSelection.status = 'pending';
//         existingSelection.approved = false;
//         existingSelection.rejectedAt = null;
//         existingSelection.isRejected = false;
//       } else {
//         ad.websiteSelections.push({
//           websiteId: websiteId,
//           categories: [categoryId],
//           approved: false,
//           status: 'pending'
//         });
//       }

//       await ad.save({ session });

//       // Add ad to category's selectedAds if not already there
//       if (!category.selectedAds.includes(adId)) {
//         category.selectedAds.push(adId);
//         await category.save({ session });
//       }

//       // TODO: Here you would handle the payment transfer from advertiser's budget to website owner's wallet
//       // This involves checking if advertiser has enough budget, creating payment record, etc.
//     });

//     res.status(200).json({
//       success: true,
//       message: 'Ad selected for your website! Payment process will be handled automatically.',
//       data: {
//         adId: adId,
//         websiteId: websiteId,
//         categoryId: categoryId
//       }
//     });

//   } catch (err) {
//     res.status(400).json({ error: err.message || 'Failed to select ad' });
//   } finally {
//     await session.endSession();
//   }
// };

// exports.getMyAds = async (req, res) => {
//   try {
//     const userId = req.user.userId || req.user.id || req.user._id;
//     const ads = await ImportAd.find({ userId: userId })
//       .populate('websiteSelections.websiteId')
//       .populate('websiteSelections.categories')
//       .sort({ createdAt: -1 });

//     // Enhanced ads with reassignment info
//     const enhancedAds = ads.map(ad => {
//       const adObj = ad.toObject();
      
//       // Check for rejected selections with refunds
//       const rejectedSelections = adObj.websiteSelections.filter(ws => 
//         ws.isRejected && ws.status === 'rejected'
//       );
      
//       // Check if ad has no website selections (never selected websites)
//       const hasNoSelections = !adObj.websiteSelections || adObj.websiteSelections.length === 0;
      
//       // Check if ad is available for reassignment
//       const canReassign = adObj.availableForReassignment || hasNoSelections || rejectedSelections.length > 0;
      
//       return {
//         ...adObj,
//         canReassign,
//         rejectedSelections: rejectedSelections.length,
//         hasNoSelections,
//         availableRefundAmount: rejectedSelections.reduce((sum, ws) => {
//           // This would need to be calculated from payment records
//           return sum; // Placeholder - implement refund calculation
//         }, 0)
//       };
//     });

//     res.status(200).json({
//       success: true,
//       ads: enhancedAds
//     });

//   } catch (error) {
//     console.error('Error fetching ads:', error);
//     res.status(500).json({ 
//       error: 'Internal Server Error',
//       message: error.message 
//     });
//   }
// };

// exports.getAdRefundInfo = async (req, res) => {
//   try {
//     const { adId } = req.params;
//     const userId = req.user.userId || req.user.id || req.user._id;
    
//     // Verify ad ownership
//     const ad = await ImportAd.findOne({ _id: adId, userId: userId });
//     if (!ad) {
//       return res.status(404).json({ error: 'Ad not found' });
//     }
    
//     // Find all refunded payments for this ad
//     const refundedPayments = await Payment.find({
//       adId: adId,
//       status: 'refunded',
//       advertiserId: userId
//     });
    
//     const totalRefundAmount = refundedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
//     res.status(200).json({
//       success: true,
//       data: {
//         adId,
//         totalRefundAmount,
//         refundedPayments: refundedPayments.map(p => ({
//           paymentId: p._id,
//           amount: p.amount,
//           websiteId: p.websiteId,
//           categoryId: p.categoryId,
//           refundedAt: p.refundedAt,
//           refundReason: p.refundReason
//         }))
//       }
//     });
    
//   } catch (error) {
//     console.error('Error fetching refund info:', error);
//     res.status(500).json({ 
//       error: 'Internal Server Error',
//       message: error.message 
//     });
//   }
// };

// exports.reassignAdWithRefund = async (req, res) => {
//   const session = await mongoose.startSession();
  
//   try {
//     const { adId } = req.params;
//     const { selectedWebsites, selectedCategories } = req.body;
//     const userId = req.user.userId || req.user.id || req.user._id;

//     await session.withTransaction(async () => {
//       // Verify ad ownership
//       const ad = await ImportAd.findOne({ _id: adId, userId: userId }).session(session);
//       if (!ad) {
//         throw new Error('Ad not found');
//       }

//       // Parse selections
//       let websitesArray, categoriesArray;
//       try {
//         websitesArray = typeof selectedWebsites === 'string' 
//           ? JSON.parse(selectedWebsites) 
//           : selectedWebsites;
//         categoriesArray = typeof selectedCategories === 'string' 
//           ? JSON.parse(selectedCategories) 
//           : selectedCategories;
//       } catch (parseError) {
//         throw new Error('Invalid selection data format');
//       }

//       // Get categories and calculate costs
//       const categories = await AdCategory.find({
//         _id: { $in: categoriesArray }
//       }).session(session);

//       if (categories.length === 0) {
//         throw new Error('No valid categories found');
//       }

//       // Create website-category mapping
//       const websiteCategoryMap = categories.reduce((map, category) => {
//         const websiteId = category.websiteId.toString();
//         if (!map.has(websiteId)) {
//           map.set(websiteId, []);
//         }
//         map.get(websiteId).push(category._id);
//         return map;
//       }, new Map());

//       // Create new website selections
//       const newWebsiteSelections = websitesArray.map(websiteId => {
//         const websiteIdStr = websiteId.toString();
//         const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
        
//         const validCategories = categoriesArray.filter(categoryId => 
//           websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
//         );

//         return {
//           websiteId: websiteId,
//           categories: validCategories,
//           approved: false,
//           approvedAt: null,
//           status: 'pending'
//         };
//       }).filter(selection => selection.categories.length > 0);

//       if (newWebsiteSelections.length === 0) {
//         throw new Error('No valid website-category combinations found');
//       }

//       // Calculate total cost for new selections
//       const totalNewCost = newWebsiteSelections.reduce((sum, selection) => {
//         const category = categories.find(cat => 
//           selection.categories.includes(cat._id) && 
//           cat.websiteId.toString() === selection.websiteId.toString()
//         );
//         return sum + (category ? category.price : 0);
//       }, 0);

//       // Get available refund amount
//       const refundedPayments = await Payment.find({
//         adId: adId,
//         status: 'refunded',
//         advertiserId: userId
//       }).session(session);

//       const availableRefundAmount = refundedPayments.reduce((sum, payment) => sum + payment.amount, 0);

//       // Filter out existing website selections to avoid duplicates
//       const existingWebsiteIds = ad.websiteSelections
//         .filter(ws => !ws.isRejected)
//         .map(ws => ws.websiteId.toString());
      
//       const selectionsToAdd = newWebsiteSelections.filter(selection => 
//         !existingWebsiteIds.includes(selection.websiteId.toString())
//       );

//       if (selectionsToAdd.length === 0) {
//         throw new Error('No new website selections to add');
//       }

//       // Add new selections to ad
//       ad.websiteSelections.push(...selectionsToAdd);
//       ad.availableForReassignment = false; // Reset flag
//       await ad.save({ session });

//       // Create payment selections with refund application
//       const paymentSelections = selectionsToAdd.map(selection => {
//         const category = categories.find(cat => 
//           selection.categories.includes(cat._id) && 
//           cat.websiteId.toString() === selection.websiteId.toString()
//         );
        
//         return {
//           websiteId: selection.websiteId,
//           categoryId: selection.categories[0],
//           price: category ? category.price : 0,
//           categoryName: category ? category.categoryName : 'Unknown',
//           websiteName: 'Unknown' // This should be populated from website data
//         };
//       });

//       // Calculate remaining amount to pay
//       const remainingAmount = Math.max(0, totalNewCost - availableRefundAmount);
//       const refundToUse = Math.min(availableRefundAmount, totalNewCost);

//       res.status(200).json({
//         success: true,
//         message: 'Ad reassignment prepared successfully',
//         data: {
//           ad: ad,
//           paymentSelections,
//           totalCost: totalNewCost,
//           availableRefundAmount,
//           refundToUse,
//           remainingAmountToPay: remainingAmount,
//           requiresPayment: remainingAmount > 0
//         }
//       });
//     });

//   } catch (error) {
//     console.error('Error in ad reassignment:', error);
//     res.status(500).json({ 
//       error: 'Internal Server Error',
//       message: error.message 
//     });
//   } finally {
//     await session.endSession();
//   }
// };

// exports.getReassignableAds = async (req, res) => {
//   try {
//     const userId = req.user.userId || req.user.id || req.user._id;
    
//     const ads = await ImportAd.find({ 
//       userId: userId,
//       $or: [
//         { availableForReassignment: true },
//         { websiteSelections: { $size: 0 } }, // No website selections
//         { 'websiteSelections.isRejected': true } // Has rejected selections
//       ]
//     })
//     .populate('websiteSelections.websiteId')
//     .populate('websiteSelections.categories')
//     .sort({ createdAt: -1 });

//     res.status(200).json({
//       success: true,
//       ads: ads
//     });

//   } catch (error) {
//     console.error('Error fetching reassignable ads:', error);
//     res.status(500).json({ 
//       error: 'Internal Server Error',
//       message: error.message 
//     });
//   }
// };

// exports.getAdBudget = async (req, res) => {
//   try {
//     const userId = req.user.userId || req.user.id || req.user._id;
    
//     // Calculate budget from payments
//     const payments = await Payment.find({ advertiserId: userId });
    
//     const spent = payments
//       .filter(p => p.status === 'successful')
//       .reduce((sum, p) => sum + p.amount, 0);
    
//     const refunded = payments
//       .filter(p => p.status === 'refunded')
//       .reduce((sum, p) => sum + p.amount, 0);
    
//     // Simple available budget calculation (you can make this more sophisticated)
//     const available = 1000; // Placeholder - implement your budget logic

//     res.status(200).json({
//       success: true,
//       budget: {
//         available,
//         spent,
//         refunded
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching ad budget:', error);
//     res.status(500).json({ error: 'Failed to fetch budget' });
//   }
// };

// exports.getUserMixedAds = async (req, res) => {
//   const { userId } = req.params;

//   try {
//     // Fetch ads with populated website selections
//     const mixedAds = await ImportAd.find({ userId })
//       .populate({
//         path: 'websiteSelections.websiteId',
//         select: 'websiteName websiteLink logoUrl'
//       })
//       .populate({
//         path: 'websiteSelections.categories',
//         select: 'price ownerId categoryName'
//       });

//     const adsWithDetails = mixedAds.map(ad => {
//       // Calculate total price across all website selections and their categories
//       const totalPrice = ad.websiteSelections.reduce((sum, selection) => {
//         const categoryPriceSum = selection.categories.reduce((catSum, category) => 
//           catSum + (category.price || 0), 0);
//         return sum + categoryPriceSum;
//       }, 0);

//       return {
//         ...ad.toObject(),
//         totalPrice,
//         isConfirmed: ad.confirmed,
//         // Get unique owner IDs across all categories
//         categoryOwnerIds: [...new Set(ad.websiteSelections.flatMap(selection => 
//           selection.categories.map(cat => cat.ownerId)))],
//         clicks: ad.clicks,
//         views: ad.views,
//         status: ad.websiteSelections.every(sel => sel.approved) ? 'approved' : 'pending'
//       };
//     });

//     res.status(200).json(adsWithDetails);
//   } catch (error) {
//     console.error('Error fetching mixed ads:', error);
//     res.status(500).json({ message: 'Failed to fetch ads', error: error.message });
//   }
// };









// WebAdvertiseController.js (PostgreSQL)
const multer = require('multer');
const path = require('path');
const cloudinary = require('../../config/storage');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const User = require('../../models/User');
const Payment = require('../models/PaymentModel');
const { getClient } = require('../../config/db');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp|tiff|svg|mp4|avi|mov|mkv|webm|pdf/;
    const isValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (isValid) return cb(null, true);
    cb(new Error('Invalid file type.'));
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseWebsiteSelections(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return Array.isArray(raw) ? raw : [];
}

// Manual "populate": replace websiteId / category ids with full objects
async function populateAd(ad) {
  if (!ad) return null;
  const Website = require('../../AdPromoter/models/CreateWebsiteModel');
  // Normalize: accept either a raw PG row (snake_case) or an already-mapped camelCase object
  const isRawRow = ad.business_name !== undefined;
  const base = isRawRow ? {
    id:                       ad.id,
    _id:                      ad.id,
    userId:                   ad.user_id,
    adOwnerEmail:             ad.ad_owner_email,
    imageUrl:                 ad.image_url,
    pdfUrl:                   ad.pdf_url,
    videoUrl:                 ad.video_url,
    businessName:             ad.business_name,
    businessLink:             ad.business_link,
    businessLocation:         ad.business_location,
    adDescription:            ad.ad_description,
    confirmed:                ad.confirmed,
    clicks:                   ad.clicks,
    views:                    ad.views,
    availableForReassignment: ad.available_for_reassignment,
    createdAt:                ad.created_at,
    updatedAt:                ad.updated_at,
  } : { ...ad };

  const rawSel = ad.website_selections !== undefined ? ad.website_selections : ad.websiteSelections;
  const selections = parseWebsiteSelections(rawSel);
  const populated = await Promise.all(selections.map(async sel => {
    const website = sel.websiteId
      ? await Website.findById(sel.websiteId).catch(() => null)
      : null;
    const cats = await Promise.all((sel.categories || []).map(cid =>
      AdCategory.findById(cid).catch(() => null)
    ));
    return { ...sel, websiteId: website || sel.websiteId, categories: cats.filter(Boolean) };
  }));
  return { ...base, websiteSelections: populated };
}

async function populateAds(ads) {
  return Promise.all(ads.map(populateAd));
}

// Build websiteSelections array from flat websitesArray + categoriesArray + fetched categories
function buildWebsiteSelections(websitesArray, categoriesArray, categories) {
  const websiteCategoryMap = categories.reduce((map, cat) => {
    const wid = (cat.website_id || cat.websiteId || '').toString();
    if (!map.has(wid)) map.set(wid, []);
    map.get(wid).push((cat.id || cat._id).toString());
    return map;
  }, new Map());

  return websitesArray.map(websiteId => {
    const wid = websiteId.toString();
    const websiteCategories = websiteCategoryMap.get(wid) || [];
    const validCategories = categoriesArray.filter(cid =>
      websiteCategories.includes(cid.toString())
    );
    return {
      websiteId,
      categories: validCategories,
      approved: false,
      approvedAt: null,
      status: 'pending',
      isRejected: false,
      rejectedAt: null,
      rejectionReason: null,
      rejectedBy: null,
    };
  }).filter(sel => sel.categories.length > 0);
}

// ─── Controllers ─────────────────────────────────────────────────────────────

exports.createImportAd = [upload.single('file'), async (req, res) => {
  try {
    const {
      adOwnerEmail,
      businessName,
      businessLink,
      businessLocation,
      adDescription,
      selectedWebsites,
      selectedCategories,
    } = req.body;

    // Only businessName is required
    if (!businessName) {
      return res.status(400).json({
        error: 'Missing Required Fields',
        message: 'businessName is required',
      });
    }

    // Handle optional website/category selections
    let websitesArray = [];
    let categoriesArray = [];
    if (selectedWebsites && selectedCategories) {
      try {
        websitesArray = typeof selectedWebsites === 'string'
          ? JSON.parse(selectedWebsites) : selectedWebsites;
        categoriesArray = typeof selectedCategories === 'string'
          ? JSON.parse(selectedCategories) : selectedCategories;
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        return res.status(400).json({
          error: 'Invalid Data Format',
          message: 'selectedWebsites and selectedCategories must be valid JSON arrays',
        });
      }
      if (!Array.isArray(websitesArray) || !Array.isArray(categoriesArray)) {
        return res.status(400).json({
          error: 'Invalid Data Type',
          message: 'selectedWebsites and selectedCategories must be arrays',
        });
      }
    }

    console.log('Parsed arrays:', { websitesArray, categoriesArray });

    // File upload
    let imageUrl = '', videoUrl = '', pdfUrl = '';
    if (req.file) {
      const resourceType = req.file.mimetype.startsWith('video') ? 'video'
        : req.file.mimetype === 'application/pdf' ? 'raw' : 'image';
      const publicUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: 'yepper_ads',
            public_id: `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
          },
          (error, result) => {
            if (error) return reject(new Error('Failed to upload file.'));
            resolve(result.secure_url);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      if (req.file.mimetype.startsWith('image')) imageUrl = publicUrl;
      else if (req.file.mimetype.startsWith('video')) videoUrl = publicUrl;
      else if (req.file.mimetype === 'application/pdf') pdfUrl = publicUrl;
    }

    // Only fetch categories if selections exist
    let categories = [];
    let websiteSelections = [];
    if (categoriesArray.length > 0) {
      console.log('Fetching categories...');
      try {
        categories = (await Promise.all(categoriesArray.map(id => AdCategory.findById(id)))).filter(Boolean);
        if (categories.length === 0) {
          return res.status(404).json({
            error: 'Categories Not Found',
            message: 'No valid categories found for the provided IDs',
          });
        }
        console.log(`Found ${categories.length} categories`);
      } catch (categoryError) {
        console.error('Category fetch error:', categoryError);
        return res.status(500).json({ error: 'Database Error', message: 'Failed to fetch categories' });
      }

      websiteSelections = buildWebsiteSelections(websitesArray, categoriesArray, categories);
      console.log('Valid website selections:', websiteSelections);

      if (websiteSelections.length === 0 && websitesArray.length > 0) {
        return res.status(400).json({
          error: 'Invalid Selection',
          message: 'No valid website and category combinations found. Please ensure the selected categories belong to the selected websites.',
        });
      }
    }

    // User lookup
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    if (!ownerId) {
      return res.status(401).json({ error: 'Authentication Required', message: 'User not authenticated' });
    }

    let user;
    try {
      user = await User.findById(ownerId);
      if (!user) {
        return res.status(404).json({ error: 'User Not Found', message: 'Authenticated user not found in database' });
      }
    } catch (userError) {
      console.error('User fetch error:', userError);
      return res.status(500).json({ error: 'Database Error', message: 'Failed to fetch user information' });
    }

    const userId = (user.id || user._id).toString();
    console.log('Creating ad for user:', userId);

    // Create new ad
    let savedAd;
    try {
      savedAd = await ImportAd.create({
        userId,
        adOwnerEmail: adOwnerEmail || user.email,
        imageUrl, videoUrl, pdfUrl,
        businessName, businessLink, businessLocation, adDescription,
        websiteSelections,
        confirmed: true,
        clicks: 0, views: 0,
      });
      console.log('Ad saved successfully:', savedAd.id);
    } catch (saveError) {
      console.error('Ad save error:', saveError);
      return res.status(500).json({ error: 'Database Error', message: `Failed to save ad: ${saveError.message}` });
    }

    let populatedAd;
    try {
      populatedAd = await populateAd(savedAd);
      if (!populatedAd) throw new Error('Failed to retrieve saved ad');
    } catch (populateError) {
      console.error('Population error:', populateError);
      populatedAd = { ...savedAd, websiteSelections };
    }

    if (websiteSelections.length > 0) {
      const adWithPaymentInfo = {
        ...populatedAd,
        adId: (savedAd.id || savedAd._id).toString(),
        _id: (savedAd.id || savedAd._id).toString(),
        paymentRequired: true,
        paymentSelections: websiteSelections.map(selection => {
          const category = categories.find(cat =>
            selection.categories.includes((cat.id || cat._id).toString()) &&
            (cat.website_id || cat.websiteId).toString() === selection.websiteId.toString()
          );
          return {
            websiteId: selection.websiteId,
            categoryId: selection.categories[0],
            price: category ? category.price : 0,
            categoryName: category ? (category.category_name || category.categoryName) : 'Unknown',
            websiteName: populatedAd.websiteSelections?.find(ws =>
              ws.websiteId?.id?.toString() === selection.websiteId.toString()
            )?.websiteId?.website_name || 'Unknown',
          };
        }),
      };
      console.log('Ad creation completed successfully with website selections');
      return res.status(201).json({
        success: true,
        data: adWithPaymentInfo,
        message: 'Ad created successfully. Please proceed with payment to publish.',
      });
    }

    console.log('Basic ad creation completed successfully');
    res.status(201).json({
      success: true,
      data: { adId: populatedAd.id, ...populatedAd, paymentRequired: false },
      message: 'Ad created successfully! You can add website selections later.',
    });

  } catch (err) {
    console.error('Unexpected error in createImportAd:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
}];

exports.updateAdSelections = async (req, res) => {
  try {
    const { adId } = req.params;
    const {
      selectedWebsites, selectedCategories,
      businessLink, businessLocation, adDescription,
    } = req.body;

    if (!selectedWebsites || !selectedCategories) {
      return res.status(400).json({
        error: 'Missing Required Fields',
        message: 'selectedWebsites and selectedCategories are required',
      });
    }

    let websitesArray, categoriesArray;
    try {
      websitesArray = typeof selectedWebsites === 'string' ? JSON.parse(selectedWebsites) : selectedWebsites;
      categoriesArray = typeof selectedCategories === 'string' ? JSON.parse(selectedCategories) : selectedCategories;
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid Data Format', message: 'Must be valid JSON arrays' });
    }

    if (!Array.isArray(websitesArray) || !Array.isArray(categoriesArray)) {
      return res.status(400).json({ error: 'Invalid Data Type', message: 'selectedWebsites and selectedCategories must be arrays' });
    }
    if (websitesArray.length === 0 || categoriesArray.length === 0) {
      return res.status(400).json({ error: 'Empty Selection', message: 'At least one website and category must be selected' });
    }

    const ad = await ImportAd.findById(adId);
    if (!ad) {
      return res.status(404).json({ error: 'Ad Not Found', message: 'The specified ad does not exist' });
    }

    const userId = req.user?.userId || req.user?.id || req.user?._id;
    if (ad.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized', message: 'You do not have permission to update this ad' });
    }

    const existingSelections = parseWebsiteSelections(ad.website_selections);
    if (existingSelections.length > 0) {
      return res.status(400).json({
        error: 'Ad Already Has Selections',
        message: 'This ad already has website selections. Use the add more sites feature instead.',
      });
    }

    const categories = (await Promise.all(categoriesArray.map(id => AdCategory.findById(id)))).filter(Boolean);
    if (categories.length === 0) {
      return res.status(404).json({ error: 'Categories Not Found', message: 'No valid categories found for the provided IDs' });
    }

    const websiteSelections = buildWebsiteSelections(websitesArray, categoriesArray, categories);
    if (websiteSelections.length === 0) {
      return res.status(400).json({ error: 'Invalid Selection', message: 'No valid website and category combinations found' });
    }

    const updateData = { websiteSelections, confirmed: true };
    if (businessLink) updateData.businessLink = businessLink;
    if (businessLocation) updateData.businessLocation = businessLocation;
    if (adDescription) updateData.adDescription = adDescription;

    const updatedAd = await ImportAd.update(adId, updateData);
    const populatedAd = await populateAd(updatedAd);

    const adWithPaymentInfo = {
      ...populatedAd,
      paymentRequired: true,
      paymentSelections: websiteSelections.map(selection => {
        const category = categories.find(cat =>
          selection.categories.includes((cat.id || cat._id).toString()) &&
          (cat.website_id || cat.websiteId).toString() === selection.websiteId.toString()
        );
        return {
          websiteId: selection.websiteId,
          categoryId: selection.categories[0],
          price: category ? category.price : 0,
          categoryName: category ? (category.category_name || category.categoryName) : 'Unknown',
          websiteName: populatedAd.websiteSelections?.find(ws =>
            ws.websiteId?.id?.toString() === selection.websiteId.toString()
          )?.websiteId?.website_name || 'Unknown',
        };
      }),
    };

    res.status(200).json({
      success: true,
      data: adWithPaymentInfo,
      message: 'Ad updated successfully. Please proceed with payment to publish.',
    });
  } catch (error) {
    console.error('Update ad selections error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};

exports.getUserAds = async (req, res) => {
  try {
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    const ads = await ImportAd.findByUser(ownerId.toString());
    const populated = await populateAds(ads);
    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getAd = async (req, res) => {
  const { adId } = req.params;
  try {
    const ad = await ImportAd.findById(adId);
    if (!ad) return res.status(404).json({ message: 'Ad not found' });

    const populatedAd = await populateAd(ad);

    const adDetails = {
      ...populatedAd,
      totalPrice: populatedAd.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) =>
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0),
      websiteStatuses: populatedAd.websiteSelections.map(selection => ({
        websiteId: selection.websiteId?.id || selection.websiteId,
        websiteName: selection.websiteId?.website_name || selection.websiteId?.websiteName,
        websiteLink: selection.websiteId?.website_link || selection.websiteId?.websiteLink,
        categories: selection.categories,
        approved: selection.approved,
        confirmed: selection.confirmed || false,
        approvedAt: selection.approvedAt,
      })),
    };

    res.status(200).json(adDetails);
  } catch (error) {
    console.error('Error fetching ad details:', error);
    res.status(500).json({ message: 'Failed to fetch ad details', error: error.message });
  }
};

exports.getAdDetails = async (req, res) => {
  try {
    const { adId } = req.params;
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;

    const ad = await ImportAd.findById(adId);
    if (!ad || ad.user_id.toString() !== ownerId.toString()) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const populatedAd = await populateAd(ad);
    res.status(200).json({ success: true, data: populatedAd });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.addWebsiteSelectionsToAd = async (req, res) => {
  try {
    const { adId } = req.params;
    const { selectedWebsites, selectedCategories, isReassignment } = req.body;
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;

    // Find and verify ad ownership
    const ad = await ImportAd.findById(adId);
    if (!ad || ad.user_id.toString() !== ownerId.toString()) {
      return res.status(404).json({ error: 'Ad not found or unauthorized' });
    }

    let websitesArray, categoriesArray;
    try {
      websitesArray = typeof selectedWebsites === 'string' ? JSON.parse(selectedWebsites) : selectedWebsites;
      categoriesArray = typeof selectedCategories === 'string' ? JSON.parse(selectedCategories) : selectedCategories;
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid Data Format',
        message: 'selectedWebsites and selectedCategories must be valid JSON arrays',
      });
    }

    // Get categories with booking status check
    const categories = (await Promise.all(categoriesArray.map(id => AdCategory.findById(id)))).filter(Boolean);

    // Check for fully booked categories
    const fullyBookedCategories = [];
    const availableCategories = [];
    for (const category of categories) {
      const maxSlots = category.user_count || category.userCount || 10;
      const selectedAds = Array.isArray(category.selected_ads)
        ? category.selected_ads
        : (Array.isArray(category.selectedAds) ? category.selectedAds : []);
      const currentSlots = selectedAds.length;
      if (currentSlots >= maxSlots) {
        fullyBookedCategories.push({
          id: category.id || category._id,
          name: category.category_name || category.categoryName,
          currentSlots,
          maxSlots,
        });
      } else {
        availableCategories.push(category);
      }
    }

    // If some categories are fully booked, inform the user
    if (fullyBookedCategories.length > 0) {
      return res.status(409).json({
        error: 'Some categories are fully booked',
        message: 'The following categories are currently fully booked. Please select other categories.',
        fullyBookedCategories,
        availableCategories: availableCategories.map(cat => ({
          id: cat.id || cat._id,
          name: cat.category_name || cat.categoryName,
          price: cat.price,
          availableSlots: (cat.user_count || cat.userCount || 10) -
            (Array.isArray(cat.selected_ads || cat.selectedAds) ? (cat.selected_ads || cat.selectedAds).length : 0),
        })),
      });
    }

    const newWebsiteSelections = buildWebsiteSelections(websitesArray, categoriesArray, availableCategories);

    // Selection logic for reassignments vs new additions
    let existingSelections = parseWebsiteSelections(ad.website_selections);
    let selectionsToAdd = [];

    if (isReassignment) {
      const websiteIdsToReassign = newWebsiteSelections.map(sel => sel.websiteId.toString());
      existingSelections = existingSelections.filter(ws =>
        !websiteIdsToReassign.includes(ws.websiteId.toString())
      );
      selectionsToAdd = newWebsiteSelections;
    } else {
      const existingActiveOrPendingWebsiteIds = existingSelections
        .filter(ws => (ws.status === 'active' || ws.status === 'pending') && !ws.isRejected)
        .map(ws => ws.websiteId.toString());
      selectionsToAdd = newWebsiteSelections.filter(selection =>
        !existingActiveOrPendingWebsiteIds.includes(selection.websiteId.toString())
      );
    }

    if (selectionsToAdd.length === 0) {
      return res.status(400).json({
        error: isReassignment ? 'No valid reassignments to make' : 'No new website selections to add',
      });
    }

    const updatedSelections = [...existingSelections, ...selectionsToAdd];
    const hasRejectedSelections = updatedSelections.some(ws => ws.isRejected);
    const hasActiveSelections = updatedSelections.some(ws => ws.status === 'active' && !ws.isRejected);

    const updatedAd = await ImportAd.update(adId, {
      websiteSelections: updatedSelections,
      availableForReassignment: hasRejectedSelections && !hasActiveSelections,
    });

    const populatedAd = await populateAd(updatedAd);

    // Get advertiser's available refunds for smart payment calculation
    const availableRefunds = await Payment.findAvailableRefunds(ownerId);
    const totalAvailableRefunds = availableRefunds.reduce((s, p) => s + (p.amount || 0), 0);

    const paymentSelections = selectionsToAdd.map(selection => {
      const category = availableCategories.find(cat =>
        selection.categories.includes((cat.id || cat._id).toString()) &&
        (cat.website_id || cat.websiteId).toString() === selection.websiteId.toString()
      );
      return {
        websiteId: selection.websiteId,
        categoryId: selection.categories[0],
        price: category ? category.price : 0,
        categoryName: category ? (category.category_name || category.categoryName) : 'Unknown',
      };
    });

    // Calculate optimal refund distribution (sort ascending to maximize refund usage)
    const calculateRefundDistribution = (selections, totalRefunds) => {
      let remainingRefunds = totalRefunds;
      return selections.map(selection => {
        const refundApplicable = Math.min(remainingRefunds, selection.price);
        const remainingCost = Math.max(0, selection.price - refundApplicable);
        remainingRefunds = Math.max(0, remainingRefunds - refundApplicable);
        return {
          ...selection,
          availableRefund: refundApplicable,
          remainingCost,
          canUseRefundOnly: remainingCost === 0 && refundApplicable > 0,
        };
      });
    };

    const enhancedPaymentSelections = calculateRefundDistribution(paymentSelections, totalAvailableRefunds);
    const totalOriginalCost = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.price, 0);
    const totalRefundSavings = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.availableRefund, 0);
    const totalRemainingCost = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.remainingCost, 0);

    res.status(200).json({
      success: true,
      message: isReassignment ? 'Ad reassigned successfully!' : 'Website selections added successfully!',
      data: {
        ad: populatedAd,
        paymentRequired: true,
        paymentSelections: enhancedPaymentSelections,
        isReassignment,
        totalAvailableRefunds,
        refundSavings: totalRefundSavings,
        totalRemainingCost,
        totalOriginalCost,
        paymentBreakdown: {
          originalTotal: totalOriginalCost,
          refundApplied: totalRefundSavings,
          finalAmountToPay: totalRemainingCost,
          refundCoverage: totalOriginalCost > 0 ? (totalRefundSavings / totalOriginalCost) * 100 : 0,
        },
      },
    });
  } catch (err) {
    console.error('Error in addWebsiteSelectionsToAd:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getAdsAvailableForReassignment = async (req, res) => {
  try {
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;

    const ads = await ImportAd.findByUserWithFilters(ownerId.toString(), { availableForReassignment: true });
    const populatedAds = await populateAds(ads);

    // Get total available refunds for the user
    const availableRefunds = await Payment.findAvailableRefunds(ownerId);
    const totalAvailableRefunds = availableRefunds.reduce((s, p) => s + (p.amount || 0), 0);

    // Get detailed refund information (joined with ad business name)
    const refundDetails = await Payment.findRefundsByAdvertiser(ownerId);

    const enrichedAds = populatedAds.map(ad => {
      const rejectedSelections = ad.websiteSelections.filter(ws => ws.isRejected);
      const activeSelections = ad.websiteSelections.filter(ws => ws.status === 'active' && !ws.isRejected);
      return {
        ...ad,
        rejectedCount: rejectedSelections.length,
        activeCount: activeSelections.length,
        canReassign: rejectedSelections.length > 0,
        rejectedSelections: rejectedSelections.map(sel => ({
          websiteId: sel.websiteId?.id || sel.websiteId,
          websiteName: sel.websiteId?.website_name || sel.websiteId?.websiteName || 'Unknown Website',
          rejectedAt: sel.rejectedAt,
          rejectionReason: sel.rejectionReason,
          categories: sel.categories,
        })),
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ads: enrichedAds,
        totalAvailableRefunds,
        refundCount: refundDetails.length,
        refundDetails: refundDetails.map(refund => ({
          amount: refund.amount,
          refundedAt: refund.refunded_at,
          reason: refund.refund_reason,
          businessName: refund.ad_business_name || 'Unknown Business',
        })),
      },
    });
  } catch (error) {
    console.error('Error getting ads available for reassignment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getAdPaymentHistory = async (req, res) => {
  try {
    const { adId } = req.params;
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;

    const ad = await ImportAd.findById(adId);
    if (!ad || ad.user_id.toString() !== ownerId.toString()) {
      return res.status(404).json({ error: 'Ad not found or unauthorized' });
    }

    // Get all payments for this ad, joined with website/category info
    const payments = await Payment.findByAd(adId);

    const paymentHistory = { successful: [], refunded: [], failed: [], pending: [] };
    const summary = {
      totalSpent: 0, totalRefunded: 0, availableRefunds: 0,
      successfulPayments: 0, refundedPayments: 0,
    };

    payments.forEach(payment => {
      const paymentData = {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.payment_method,
        createdAt: payment.created_at,
        paidAt: payment.paid_at,
        websiteName: payment.website_name || 'Unknown',
        categoryName: payment.category_name || 'Unknown',
        refundApplied: payment.refund_applied || 0,
        amountPaid: payment.amount_paid || payment.amount,
      };

      switch (payment.status) {
        case 'successful':
          paymentHistory.successful.push(paymentData);
          summary.totalSpent += payment.amount;
          summary.successfulPayments++;
          break;
        case 'refunded':
        case 'internally_refunded':
          paymentHistory.refunded.push({
            ...paymentData,
            refundedAt: payment.refunded_at,
            refundReason: payment.refund_reason,
            refundUsed: payment.refund_used || false,
          });
          if (!payment.refund_used) summary.availableRefunds += payment.amount;
          summary.totalRefunded += payment.amount;
          summary.refundedPayments++;
          break;
        case 'failed':
          paymentHistory.failed.push(paymentData);
          break;
        case 'pending':
          paymentHistory.pending.push(paymentData);
          break;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        adId,
        businessName: ad.business_name,
        paymentHistory,
        summary,
      },
    });
  } catch (error) {
    console.error('Error getting ad payment history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.updateAdDetails = async (req, res) => {
  try {
    const { adId } = req.params;
    const { businessName, businessLink, businessLocation, adDescription } = req.body;
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;

    const ad = await ImportAd.findById(adId);
    if (!ad || ad.user_id.toString() !== ownerId.toString()) {
      return res.status(404).json({ error: 'Ad not found or unauthorized' });
    }

    const fields = {};
    if (businessName) fields.businessName = businessName;
    if (businessLink) fields.businessLink = businessLink;
    if (businessLocation) fields.businessLocation = businessLocation;
    if (adDescription) fields.adDescription = adDescription;

    const updatedAd = await ImportAd.update(adId, fields);
    res.status(200).json({ success: true, message: 'Ad updated successfully!', data: updatedAd });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getAvailableAdsForWebsite = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;

    // Find ads that are:
    // 1. Available for reassignment (rejected or never selected this website)
    // 2. Not created by this website owner
    const allAds = await ImportAd.findAll();
    const filtered = allAds.filter(ad => {
      if (ad.user_id.toString() === ownerId.toString()) return false; // Not owned by current user
      if (ad.available_for_reassignment) return true; // Marked as available after rejection
      const selections = parseWebsiteSelections(ad.website_selections);
      // Never selected this website, or any selection is not active/pending
      const existingActiveOrPending = selections.find(ws =>
        ws.websiteId?.toString() === websiteId.toString() &&
        (ws.status === 'active' || ws.status === 'pending')
      );
      return !existingActiveOrPending;
    });

    const populated = await populateAds(filtered);
    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.selectAdForWebsite = async (req, res) => {
  const client = await getClient();
  try {
    const { adId, websiteId, categoryId } = req.body;
    const websiteOwnerId = req.user?.userId || req.user?.id || req.user?._id;

    await client.query('BEGIN');

    // Verify website ownership through category
    const category = await AdCategory.findById(categoryId);
    if (
      !category ||
      (category.website_id || category.websiteId)?.toString() !== websiteId.toString() ||
      (category.owner_id || category.ownerId)?.toString() !== websiteOwnerId.toString()
    ) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Category not found or unauthorized' });
    }

    const ad = await ImportAd.findById(adId);
    if (!ad) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ad not found' });
    }

    const selections = parseWebsiteSelections(ad.website_selections);
    const existingIdx = selections.findIndex(ws =>
      ws.websiteId?.toString() === websiteId.toString()
    );

    if (existingIdx !== -1 && selections[existingIdx].status === 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ad already active on this website' });
    }

    // Add or update website selection
    if (existingIdx !== -1) {
      selections[existingIdx] = {
        ...selections[existingIdx],
        categories: [categoryId],
        status: 'pending',
        approved: false,
        rejectedAt: null,
        isRejected: false,
      };
    } else {
      selections.push({ websiteId, categories: [categoryId], approved: false, status: 'pending' });
    }

    await ImportAd.update(adId, { websiteSelections: selections });

    // Add ad to category's selectedAds if not already there
    const selectedAds = Array.isArray(category.selected_ads)
      ? category.selected_ads
      : (Array.isArray(category.selectedAds) ? category.selectedAds : []);
    if (!selectedAds.includes(adId)) {
      await AdCategory.update(categoryId, { selectedAds: [...selectedAds, adId] });
    }

    // TODO: Handle payment transfer from advertiser's budget to website owner's wallet

    await client.query('COMMIT');
    res.status(200).json({
      success: true,
      message: 'Ad selected for your website! Payment process will be handled automatically.',
      data: { adId, websiteId, categoryId },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'Failed to select ad' });
  } finally {
    client.release();
  }
};

exports.getMyAds = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const ads = await ImportAd.findByUser(userId.toString());
    const populatedAds = await populateAds(ads);

    // Enhanced ads with reassignment info
    const enhancedAds = populatedAds.map(ad => {
      // Check for rejected selections with refunds
      const rejectedSelections = ad.websiteSelections.filter(ws =>
        ws.isRejected && ws.status === 'rejected'
      );
      // Check if ad has no website selections (never selected websites)
      const hasNoSelections = !ad.websiteSelections || ad.websiteSelections.length === 0;
      // Check if ad is available for reassignment
      const canReassign = ad.available_for_reassignment || hasNoSelections || rejectedSelections.length > 0;

      return {
        ...ad,
        canReassign,
        rejectedSelections: rejectedSelections.length,
        hasNoSelections,
        availableRefundAmount: rejectedSelections.reduce((sum, _ws) => {
          // Placeholder - implement refund calculation from payment records
          return sum;
        }, 0),
      };
    });

    res.status(200).json({ success: true, ads: enhancedAds });
  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};

exports.getAdRefundInfo = async (req, res) => {
  try {
    const { adId } = req.params;
    const userId = req.user.userId || req.user.id || req.user._id;

    const ad = await ImportAd.findById(adId);
    if (!ad || ad.user_id.toString() !== userId.toString()) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    // Find all refunded payments for this ad
    const payments = await Payment.findByAd(adId);
    const refundedPayments = payments.filter(p =>
      p.status === 'refunded' && (p.advertiser_id || p.advertiserId)?.toString() === userId.toString()
    );
    const totalRefundAmount = refundedPayments.reduce((sum, payment) => sum + payment.amount, 0);

    res.status(200).json({
      success: true,
      data: {
        adId,
        totalRefundAmount,
        refundedPayments: refundedPayments.map(p => ({
          paymentId: p.id,
          amount: p.amount,
          websiteId: p.website_id,
          categoryId: p.category_id,
          refundedAt: p.refunded_at,
          refundReason: p.refund_reason,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching refund info:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};

exports.reassignAdWithRefund = async (req, res) => {
  const client = await getClient();
  try {
    const { adId } = req.params;
    const { selectedWebsites, selectedCategories } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    await client.query('BEGIN');

    // Verify ad ownership
    const ad = await ImportAd.findById(adId);
    if (!ad || ad.user_id.toString() !== userId.toString()) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ad not found' });
    }

    // Parse selections
    let websitesArray, categoriesArray;
    try {
      websitesArray = typeof selectedWebsites === 'string' ? JSON.parse(selectedWebsites) : selectedWebsites;
      categoriesArray = typeof selectedCategories === 'string' ? JSON.parse(selectedCategories) : selectedCategories;
    } catch (parseError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid selection data format' });
    }

    // Get categories and calculate costs
    const categories = (await Promise.all(categoriesArray.map(id => AdCategory.findById(id)))).filter(Boolean);
    if (categories.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No valid categories found' });
    }

    const newWebsiteSelections = buildWebsiteSelections(websitesArray, categoriesArray, categories);
    if (newWebsiteSelections.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid website-category combinations found' });
    }

    // Calculate total cost for new selections
    const totalNewCost = newWebsiteSelections.reduce((sum, selection) => {
      const category = categories.find(cat =>
        selection.categories.includes((cat.id || cat._id).toString()) &&
        (cat.website_id || cat.websiteId).toString() === selection.websiteId.toString()
      );
      return sum + (category ? category.price : 0);
    }, 0);

    // Get available refund amount for this ad
    const adPayments = await Payment.findByAd(adId);
    const refundedPayments = adPayments.filter(p =>
      p.status === 'refunded' && (p.advertiser_id || p.advertiserId)?.toString() === userId.toString()
    );
    const availableRefundAmount = refundedPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Filter out existing website selections to avoid duplicates
    const existingSelections = parseWebsiteSelections(ad.website_selections);
    const existingWebsiteIds = existingSelections
      .filter(ws => !ws.isRejected)
      .map(ws => ws.websiteId.toString());
    const selectionsToAdd = newWebsiteSelections.filter(selection =>
      !existingWebsiteIds.includes(selection.websiteId.toString())
    );

    if (selectionsToAdd.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No new website selections to add' });
    }

    // Add new selections to ad
    const updatedSelections = [...existingSelections, ...selectionsToAdd];
    await ImportAd.update(adId, {
      websiteSelections: updatedSelections,
      availableForReassignment: false, // Reset flag
    });

    // Create payment selections with refund application
    const paymentSelections = selectionsToAdd.map(selection => {
      const category = categories.find(cat =>
        selection.categories.includes((cat.id || cat._id).toString()) &&
        (cat.website_id || cat.websiteId).toString() === selection.websiteId.toString()
      );
      return {
        websiteId: selection.websiteId,
        categoryId: selection.categories[0],
        price: category ? category.price : 0,
        categoryName: category ? (category.category_name || category.categoryName) : 'Unknown',
        websiteName: 'Unknown', // Should be populated from website data
      };
    });

    const refundToUse = Math.min(availableRefundAmount, totalNewCost);
    const remainingAmount = Math.max(0, totalNewCost - availableRefundAmount);

    await client.query('COMMIT');
    res.status(200).json({
      success: true,
      message: 'Ad reassignment prepared successfully',
      data: {
        ad: { ...ad, websiteSelections: updatedSelections },
        paymentSelections,
        totalCost: totalNewCost,
        availableRefundAmount,
        refundToUse,
        remainingAmountToPay: remainingAmount,
        requiresPayment: remainingAmount > 0,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in ad reassignment:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  } finally {
    client.release();
  }
};

exports.getReassignableAds = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const ads = await ImportAd.findByUser(userId.toString());

    // Filter: availableForReassignment OR no selections OR has rejected selections
    const reassignable = ads.filter(ad => {
      if (ad.available_for_reassignment) return true;
      const selections = parseWebsiteSelections(ad.website_selections);
      if (selections.length === 0) return true;
      return selections.some(ws => ws.isRejected);
    });

    const populated = await populateAds(reassignable);
    res.status(200).json({ success: true, ads: populated });
  } catch (error) {
    console.error('Error fetching reassignable ads:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};

exports.getAdBudget = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const payments = await Payment.findByAdvertiser(userId);

    const spent = payments
      .filter(p => p.status === 'successful')
      .reduce((sum, p) => sum + p.amount, 0);
    const refunded = payments
      .filter(p => p.status === 'refunded')
      .reduce((sum, p) => sum + p.amount, 0);

    const available = 1000; // Placeholder - implement your budget logic

    res.status(200).json({ success: true, budget: { available, spent, refunded } });
  } catch (error) {
    console.error('Error fetching ad budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
};

exports.getUserMixedAds = async (req, res) => {
  const { userId } = req.params;
  try {
    const ads = await ImportAd.findByUser(userId);
    const populatedAds = await populateAds(ads);

    const adsWithDetails = populatedAds.map(ad => {
      // Calculate total price across all website selections and their categories
      const totalPrice = ad.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) =>
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0);

      return {
        ...ad,
        totalPrice,
        isConfirmed: ad.confirmed,
        // Get unique owner IDs across all categories
        categoryOwnerIds: [...new Set(ad.websiteSelections.flatMap(selection =>
          selection.categories.map(cat => cat.owner_id || cat.ownerId)
        ))],
        clicks: ad.clicks,
        views: ad.views,
        status: ad.websiteSelections.length > 0 && ad.websiteSelections.every(sel => sel.approved)
          ? 'approved' : 'pending',
      };
    });

    res.status(200).json(adsWithDetails);
  } catch (error) {
    console.error('Error fetching mixed ads:', error);
    res.status(500).json({ message: 'Failed to fetch ads', error: error.message });
  }
};