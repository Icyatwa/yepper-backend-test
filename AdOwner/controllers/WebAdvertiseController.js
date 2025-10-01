// WebAdvertiseController.js
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bucket = require('../../config/storage');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const User = require('../../models/User');
const Payment = require('../models/PaymentModel');

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
      adOwnerEmail,
      businessName,
      businessLink,
      businessLocation,
      adDescription,
      selectedWebsites, // CHANGE: Make optional
      selectedCategories, // CHANGE: Make optional
    } = req.body;

    // CHANGE: Only businessName is required now
    if (!businessName) {
      return res.status(400).json({
        error: 'Missing Required Fields',
        message: 'businessName is required'
      });
    }

    // CHANGE: Handle optional website/category selections
    let websitesArray = [];
    let categoriesArray = [];
    
    if (selectedWebsites && selectedCategories) {
      try {
        websitesArray = typeof selectedWebsites === 'string' 
          ? JSON.parse(selectedWebsites) 
          : selectedWebsites;
        categoriesArray = typeof selectedCategories === 'string' 
          ? JSON.parse(selectedCategories) 
          : selectedCategories;
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        return res.status(400).json({
          error: 'Invalid Data Format',
          message: 'selectedWebsites and selectedCategories must be valid JSON arrays'
        });
      }

      // Validate arrays only if provided
      if (!Array.isArray(websitesArray) || !Array.isArray(categoriesArray)) {
        return res.status(400).json({
          error: 'Invalid Data Type',
          message: 'selectedWebsites and selectedCategories must be arrays'
        });
      }
    }

    console.log('Parsed arrays:', { websitesArray, categoriesArray });

    // File upload logic remains the same...
    let imageUrl = '';
    let videoUrl = '';
    let pdfUrl = '';

    if (req.file) {
      const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
      const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: req.file.mimetype,
      });

      await new Promise((resolve, reject) => {
        blobStream.on('error', (err) => {
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
            reject(new Error('Failed to make file public.'));
          }
        });

        blobStream.end(req.file.buffer);
      });
    }

    // CHANGE: Only fetch categories if selections exist
    let categories = [];
    let websiteSelections = [];
    
    if (categoriesArray.length > 0) {
      console.log('Fetching categories...');
      try {
        categories = await AdCategory.find({
          _id: { $in: categoriesArray }
        });
        
        if (categories.length === 0) {
          return res.status(404).json({
            error: 'Categories Not Found',
            message: 'No valid categories found for the provided IDs'
          });
        }
        
        console.log(`Found ${categories.length} categories`);
      } catch (categoryError) {
        console.error('Category fetch error:', categoryError);
        return res.status(500).json({
          error: 'Database Error',
          message: 'Failed to fetch categories'
        });
      }

      // Create website-category mapping
      const websiteCategoryMap = categories.reduce((map, category) => {
        const websiteId = category.websiteId.toString();
        if (!map.has(websiteId)) {
          map.set(websiteId, []);
        }
        map.get(websiteId).push(category._id);
        return map;
      }, new Map());

      console.log('Website-category mapping:', Object.fromEntries(websiteCategoryMap));

      // Create website selections with validation
      websiteSelections = websitesArray.map(websiteId => {
        const websiteIdStr = websiteId.toString();
        const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
        
        const validCategories = categoriesArray.filter(categoryId => 
          websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
        );

        return {
          websiteId: websiteId,
          categories: validCategories,
          approved: false,
          approvedAt: null,
          status: 'pending'
        };
      }).filter(selection => selection.categories.length > 0);

      if (websiteSelections.length === 0 && websitesArray.length > 0) {
        return res.status(400).json({
          error: 'Invalid Selection',
          message: 'No valid website and category combinations found. Please ensure the selected categories belong to the selected websites.'
        });
      }

      console.log('Valid website selections:', websiteSelections);
    }

    // User information handling remains the same...
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    if (!ownerId) {
      return res.status(401).json({
        error: 'Authentication Required',
        message: 'User not authenticated'
      });
    }

    let user;
    try {
      user = await User.findById(ownerId);
      if (!user) {
        return res.status(404).json({
          error: 'User Not Found',
          message: 'Authenticated user not found in database'
        });
      }
    } catch (userError) {
      console.error('User fetch error:', userError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to fetch user information'
      });
    }

    const userId = user._id.toString();
    console.log('Creating ad for user:', userId);

    // Create new ad
    const newRequestAd = new ImportAd({
      userId,
      adOwnerEmail: adOwnerEmail || user.email,
      imageUrl,
      videoUrl,
      pdfUrl,
      businessName,
      businessLink,
      businessLocation,
      adDescription,
      websiteSelections, // CHANGE: Can be empty array
      confirmed: true, // CHANGE: Always true since basic info is complete
      clicks: 0,
      views: 0
    });

    // Save ad with error handling - same logic
    let savedRequestAd;
    try {
      savedRequestAd = await newRequestAd.save();
      console.log('Ad saved successfully:', savedRequestAd._id);
    } catch (saveError) {
      console.error('Ad save error:', saveError);
      return res.status(500).json({
        error: 'Database Error',
        message: `Failed to save ad: ${saveError.message}`
      });
    }

    // Populate ad data with error handling - same logic
    let populatedAd;
    try {
      populatedAd = await ImportAd.findById(savedRequestAd._id)
        .populate('websiteSelections.websiteId')
        .populate('websiteSelections.categories');
      
      if (!populatedAd) {
        throw new Error('Failed to retrieve saved ad');
      }
    } catch (populateError) {
      console.error('Population error:', populateError);
      populatedAd = savedRequestAd;
    }

    // CHANGE: Conditional response based on whether website selections exist
    if (websiteSelections.length > 0) {
      // Create payment information - existing logic
      const adWithPaymentInfo = {
        ...populatedAd.toObject(),
        paymentRequired: true,
        paymentSelections: websiteSelections.map(selection => {
          const category = categories.find(cat => 
            selection.categories.includes(cat._id) && 
            cat.websiteId.toString() === selection.websiteId.toString()
          );
          return {
            websiteId: selection.websiteId,
            categoryId: selection.categories[0],
            price: category ? category.price : 0,
            categoryName: category ? category.categoryName : 'Unknown',
            websiteName: populatedAd.websiteSelections?.find(ws => 
              ws.websiteId.toString() === selection.websiteId.toString()
            )?.websiteId?.websiteName || 'Unknown'
          };
        })
      };

      console.log('Ad creation completed successfully with website selections');
      
      res.status(201).json({
        success: true,
        data: adWithPaymentInfo,
        message: 'Ad created successfully. Please proceed with payment to publish.'
      });
    } else {
      // CHANGE: Response for basic ad creation without website selections
      console.log('Basic ad creation completed successfully');
      
      res.status(201).json({
        success: true,
        data: {
          adId: populatedAd._id,
          ...populatedAd.toObject(),
          paymentRequired: false
        },
        message: 'Ad created successfully! You can add website selections later.'
      });
    }

  } catch (err) {
    console.error('Unexpected error in createImportAd:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}];

exports.updateAdSelections = async (req, res) => {
  try {
    const { adId } = req.params;
    const {
      selectedWebsites,
      selectedCategories,
      // Optional: allow updating other fields
      businessLink,
      businessLocation,
      adDescription
    } = req.body;

    // Validate required fields
    if (!selectedWebsites || !selectedCategories) {
      return res.status(400).json({
        error: 'Missing Required Fields',
        message: 'selectedWebsites and selectedCategories are required'
      });
    }

    // Parse arrays
    let websitesArray, categoriesArray;
    try {
      websitesArray = typeof selectedWebsites === 'string' 
        ? JSON.parse(selectedWebsites) 
        : selectedWebsites;
      categoriesArray = typeof selectedCategories === 'string' 
        ? JSON.parse(selectedCategories) 
        : selectedCategories;
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid Data Format',
        message: 'selectedWebsites and selectedCategories must be valid JSON arrays'
      });
    }

    if (!Array.isArray(websitesArray) || !Array.isArray(categoriesArray)) {
      return res.status(400).json({
        error: 'Invalid Data Type',
        message: 'selectedWebsites and selectedCategories must be arrays'
      });
    }

    if (websitesArray.length === 0 || categoriesArray.length === 0) {
      return res.status(400).json({
        error: 'Empty Selection',
        message: 'At least one website and category must be selected'
      });
    }

    // Get the ad
    const ad = await ImportAd.findById(adId);
    if (!ad) {
      return res.status(404).json({
        error: 'Ad Not Found',
        message: 'The specified ad does not exist'
      });
    }

    // Verify ownership
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    if (ad.userId !== userId) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'You do not have permission to update this ad'
      });
    }

    // Check if ad already has website selections
    if (ad.websiteSelections && ad.websiteSelections.length > 0) {
      return res.status(400).json({
        error: 'Ad Already Has Selections',
        message: 'This ad already has website selections. Use the add more sites feature instead.'
      });
    }

    // Fetch categories
    const categories = await AdCategory.find({
      _id: { $in: categoriesArray }
    });
    
    if (categories.length === 0) {
      return res.status(404).json({
        error: 'Categories Not Found',
        message: 'No valid categories found for the provided IDs'
      });
    }

    // Create website-category mapping
    const websiteCategoryMap = categories.reduce((map, category) => {
      const websiteId = category.websiteId.toString();
      if (!map.has(websiteId)) {
        map.set(websiteId, []);
      }
      map.get(websiteId).push(category._id);
      return map;
    }, new Map());

    // Create website selections
    const websiteSelections = websitesArray.map(websiteId => {
      const websiteIdStr = websiteId.toString();
      const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
      
      const validCategories = categoriesArray.filter(categoryId => 
        websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
      );

      return {
        websiteId: websiteId,
        categories: validCategories,
        approved: false,
        approvedAt: null,
        status: 'pending'
      };
    }).filter(selection => selection.categories.length > 0);

    if (websiteSelections.length === 0) {
      return res.status(400).json({
        error: 'Invalid Selection',
        message: 'No valid website and category combinations found'
      });
    }

    // Update the ad
    const updateData = {
      websiteSelections: websiteSelections,
      confirmed: true
    };

    // Optionally update other fields if provided
    if (businessLink) updateData.businessLink = businessLink;
    if (businessLocation) updateData.businessLocation = businessLocation;
    if (adDescription) updateData.adDescription = adDescription;

    const updatedAd = await ImportAd.findByIdAndUpdate(
      adId,
      { $set: updateData },
      { new: true }
    ).populate('websiteSelections.websiteId')
     .populate('websiteSelections.categories');

    // Prepare payment info
    const adWithPaymentInfo = {
      ...updatedAd.toObject(),
      paymentRequired: true,
      paymentSelections: websiteSelections.map(selection => {
        const category = categories.find(cat => 
          selection.categories.includes(cat._id) && 
          cat.websiteId.toString() === selection.websiteId.toString()
        );
        return {
          websiteId: selection.websiteId,
          categoryId: selection.categories[0],
          price: category ? category.price : 0,
          categoryName: category ? category.categoryName : 'Unknown',
          websiteName: updatedAd.websiteSelections?.find(ws => 
            ws.websiteId.toString() === selection.websiteId.toString()
          )?.websiteId?.websiteName || 'Unknown'
        };
      })
    };

    res.status(200).json({
      success: true,
      data: adWithPaymentInfo,
      message: 'Ad updated successfully. Please proceed with payment to publish.'
    });

  } catch (error) {
    console.error('Update ad selections error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

exports.getUserAds = async (req, res) => {
  try {
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    
    const ads = await ImportAd.find({ userId: ownerId.toString() })
      .populate('websiteSelections.websiteId')
      .populate('websiteSelections.categories')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: ads
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Internal Server Error'
    });
  }
};

exports.getAd = async (req, res) => {
  const { adId } = req.params;

  try {
    const ad = await ImportAd.findById(adId)
      .populate({
        path: 'websiteSelections.websiteId',
        select: 'websiteName websiteLink'
      })
      .populate({
        path: 'websiteSelections.categories',
        select: 'categoryName price ownerId'
      });

    if (!ad) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const adDetails = {
      ...ad.toObject(),
      totalPrice: ad.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) => 
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0),
      websiteStatuses: ad.websiteSelections.map(selection => ({
        websiteId: selection.websiteId._id,
        websiteName: selection.websiteId.websiteName,
        websiteLink: selection.websiteId.websiteLink,
        categories: selection.categories,
        approved: selection.approved,
        confirmed: selection.confirmed || false,
        approvedAt: selection.approvedAt
      }))
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

    const ad = await ImportAd.findOne({ 
      _id: adId, 
      userId: ownerId.toString() 
    })
    .populate('websiteSelections.websiteId')
    .populate('websiteSelections.categories');

    if (!ad) {
      return res.status(404).json({
        error: 'Ad not found'
      });
    }

    res.status(200).json({
      success: true,
      data: ad
    });

  } catch (err) {
    res.status(500).json({ 
      error: 'Internal Server Error'
    });
  }
};

exports.addWebsiteSelectionsToAd = async (req, res) => {
  try {
    const { adId } = req.params;
    const { selectedWebsites, selectedCategories, isReassignment } = req.body;

    const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    
    // Find and verify ad ownership
    const ad = await ImportAd.findOne({ _id: adId, userId: ownerId.toString() });

    let websitesArray, categoriesArray;
    try {
      websitesArray = typeof selectedWebsites === 'string' 
        ? JSON.parse(selectedWebsites) 
        : selectedWebsites;
      categoriesArray = typeof selectedCategories === 'string' 
        ? JSON.parse(selectedCategories) 
        : selectedCategories;
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid Data Format',
        message: 'selectedWebsites and selectedCategories must be valid JSON arrays'
      });
    }

    // Get categories with booking status check
    const categories = await AdCategory.find({
      _id: { $in: categoriesArray }
    });

    // Check for fully booked categories
    const fullyBookedCategories = [];
    const availableCategories = [];
    
    for (const category of categories) {
      const maxSlots = category.userCount || 10;
      const currentSlots = category.selectedAds ? category.selectedAds.length : 0;
      
      if (currentSlots >= maxSlots) {
        fullyBookedCategories.push({
          id: category._id,
          name: category.categoryName,
          currentSlots,
          maxSlots
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
        fullyBookedCategories: fullyBookedCategories,
        availableCategories: availableCategories.map(cat => ({
          id: cat._id,
          name: cat.categoryName,
          price: cat.price,
          availableSlots: (cat.userCount || 10) - (cat.selectedAds?.length || 0)
        }))
      });
    }

    const websiteCategoryMap = availableCategories.reduce((map, category) => {
      const websiteId = category.websiteId.toString();
      if (!map.has(websiteId)) {
        map.set(websiteId, []);
      }
      map.get(websiteId).push(category._id);
      return map;
    }, new Map());

    const newWebsiteSelections = websitesArray.map(websiteId => {
      const websiteIdStr = websiteId.toString();
      const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
      const validCategories = categoriesArray.filter(categoryId => 
        websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
      );

      return {
        websiteId: websiteId,
        categories: validCategories,
        approved: false,
        approvedAt: null,
        status: 'pending',
        isRejected: false,
        rejectedAt: null,
        rejectionReason: null,
        rejectedBy: null
      };
    }).filter(selection => selection.categories.length > 0);

    // Selection logic for reassignments
    let selectionsToAdd = [];
    
    if (isReassignment) {
      const websiteIdsToReassign = newWebsiteSelections.map(sel => sel.websiteId.toString());
      ad.websiteSelections = ad.websiteSelections.filter(ws => 
        !websiteIdsToReassign.includes(ws.websiteId.toString())
      );
      selectionsToAdd = newWebsiteSelections;
    } else {
      const existingActiveOrPendingWebsiteIds = ad.websiteSelections
        .filter(ws => (ws.status === 'active' || ws.status === 'pending') && !ws.isRejected)
        .map(ws => ws.websiteId.toString());
        
      selectionsToAdd = newWebsiteSelections.filter(selection => 
        !existingActiveOrPendingWebsiteIds.includes(selection.websiteId.toString())
      );
    }

    if (selectionsToAdd.length === 0) {
      return res.status(400).json({
        error: isReassignment ? 'No valid reassignments to make' : 'No new website selections to add'
      });
    }

    ad.websiteSelections.push(...selectionsToAdd);
    
    const hasRejectedSelections = ad.websiteSelections.some(ws => ws.isRejected);
    const hasActiveSelections = ad.websiteSelections.some(ws => ws.status === 'active' && !ws.isRejected);
    ad.availableForReassignment = hasRejectedSelections && !hasActiveSelections;
    
    await ad.save();

    const populatedAd = await ImportAd.findById(adId)
      .populate('websiteSelections.websiteId')
      .populate('websiteSelections.categories');

    // ENHANCED: Get advertiser's available refunds for smart payment calculation
    const availableRefunds = await Payment.getAllAvailableRefunds(ownerId);

    // ENHANCED: Smart refund distribution calculation
    const paymentSelections = selectionsToAdd.map(selection => {
      const category = availableCategories.find(cat => 
        selection.categories.includes(cat._id) && 
        cat.websiteId.toString() === selection.websiteId.toString()
      );
      
      return {
        websiteId: selection.websiteId,
        categoryId: selection.categories[0],
        price: category ? category.price : 0,
        categoryName: category ? category.categoryName : 'Unknown'
      };
    });

    // ENHANCED: Calculate optimal refund distribution
    const calculateRefundDistribution = (selections, totalRefunds) => {
      // Sort selections by price (ascending) to maximize refund usage
      const sortedSelections = [...selections].sort((a, b) => a.price - b.price);
      let remainingRefunds = totalRefunds;
      
      return selections.map(selection => {
        const refundApplicable = Math.min(remainingRefunds, selection.price);
        const remainingCost = Math.max(0, selection.price - refundApplicable);
        remainingRefunds = Math.max(0, remainingRefunds - refundApplicable);
        
        return {
          ...selection,
          availableRefund: refundApplicable,
          remainingCost: remainingCost,
          canUseRefundOnly: remainingCost === 0 && refundApplicable > 0
        };
      });
    };

    const enhancedPaymentSelections = calculateRefundDistribution(paymentSelections, availableRefunds);
    
    // Calculate totals
    const totalOriginalCost = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.price, 0);
    const totalRefundSavings = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.availableRefund, 0);
    const totalRemainingCost = enhancedPaymentSelections.reduce((sum, sel) => sum + sel.remainingCost, 0);

    res.status(200).json({
      success: true,
      message: isReassignment 
        ? 'Ad reassigned successfully!' 
        : 'Website selections added successfully!',
      data: {
        ad: populatedAd,
        paymentRequired: true,
        paymentSelections: enhancedPaymentSelections,
        isReassignment,
        totalAvailableRefunds: availableRefunds,
        refundSavings: totalRefundSavings,
        totalRemainingCost: totalRemainingCost,
        totalOriginalCost: totalOriginalCost,
        // ENHANCED: Add breakdown for better UI display
        paymentBreakdown: {
          originalTotal: totalOriginalCost,
          refundApplied: totalRefundSavings,
          finalAmountToPay: totalRemainingCost,
          refundCoverage: totalOriginalCost > 0 ? (totalRefundSavings / totalOriginalCost) * 100 : 0
        }
      }
    });

  } catch (err) {
    console.error('Error in addWebsiteSelectionsToAd:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getAdsAvailableForReassignment = async (req, res) => {
  try {
    const ownerId = req.user?.userId || req.user?.id || req.user?._id;
    
    // Find ads that have rejected selections
    const ads = await ImportAd.find({
      userId: ownerId.toString(),
      availableForReassignment: true
    }).populate('websiteSelections.websiteId').populate('websiteSelections.categories');

    // ENHANCED: Get total available refunds for the user
    const totalAvailableRefunds = await Payment.getAllAvailableRefunds(ownerId);
    
    // ENHANCED: Get detailed refund information
    const refundDetails = await Payment.find({
      advertiserId: ownerId,
      status: 'refunded',
      refundUsed: { $ne: true }
    }).select('amount refundedAt refundReason adId').populate('adId', 'businessName');

    const enrichedAds = ads.map(ad => {
      const rejectedSelections = ad.websiteSelections.filter(ws => ws.isRejected);
      const activeSelections = ad.websiteSelections.filter(ws => ws.status === 'active' && !ws.isRejected);
      
      return {
        ...ad.toObject(),
        rejectedCount: rejectedSelections.length,
        activeCount: activeSelections.length,
        canReassign: rejectedSelections.length > 0,
        rejectedSelections: rejectedSelections.map(sel => ({
          websiteId: sel.websiteId._id,
          websiteName: sel.websiteId.websiteName || 'Unknown Website',
          rejectedAt: sel.rejectedAt,
          rejectionReason: sel.rejectionReason,
          categories: sel.categories
        }))
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ads: enrichedAds,
        totalAvailableRefunds: totalAvailableRefunds,
        refundCount: refundDetails.length,
        refundDetails: refundDetails.map(refund => ({
          amount: refund.amount,
          refundedAt: refund.refundedAt,
          reason: refund.refundReason,
          businessName: refund.adId?.businessName || 'Unknown Business'
        }))
      }
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

    // Verify ad ownership
    const ad = await ImportAd.findOne({ _id: adId, userId: ownerId.toString() });
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found or unauthorized' });
    }

    // Get all payments for this ad
    const payments = await Payment.find({ adId: adId })
      .populate('websiteId', 'websiteName')
      .populate('categoryId', 'categoryName price')
      .sort({ createdAt: -1 });

    // ENHANCED: Categorize payments
    const paymentHistory = {
      successful: [],
      refunded: [],
      failed: [],
      pending: []
    };

    const summary = {
      totalSpent: 0,
      totalRefunded: 0,
      availableRefunds: 0,
      successfulPayments: 0,
      refundedPayments: 0
    };

    payments.forEach(payment => {
      const paymentData = {
        id: payment._id,
        amount: payment.amount,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
        websiteName: payment.websiteId?.websiteName || 'Unknown',
        categoryName: payment.categoryId?.categoryName || 'Unknown',
        refundApplied: payment.refundApplied || 0,
        amountPaid: payment.amountPaid || payment.amount
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
            refundedAt: payment.refundedAt,
            refundReason: payment.refundReason,
            refundUsed: payment.refundUsed || false
          });
          if (!payment.refundUsed) {
            summary.availableRefunds += payment.amount;
          }
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
        adId: adId,
        businessName: ad.businessName,
        paymentHistory: paymentHistory,
        summary: summary
      }
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

    const ad = await ImportAd.findOne({ _id: adId, userId: ownerId.toString() });
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found or unauthorized' });
    }

    // Update fields if provided
    if (businessName) ad.businessName = businessName;
    if (businessLink) ad.businessLink = businessLink;
    if (businessLocation) ad.businessLocation = businessLocation;
    if (adDescription) ad.adDescription = adDescription;

    await ad.save();

    res.status(200).json({
      success: true,
      message: 'Ad updated successfully!',
      data: ad
    });

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
    const availableAds = await ImportAd.find({
      $and: [
        { userId: { $ne: ownerId.toString() } }, // Not owned by current user
        {
          $or: [
            { availableForReassignment: true }, // Marked as available after rejection
            { 
              websiteSelections: { 
                $not: { 
                  $elemMatch: { 
                    websiteId: websiteId,
                    status: { $in: ['active', 'pending'] }
                  } 
                } 
              } 
            } // Never selected this website or was rejected
          ]
        }
      ]
    }).populate('websiteSelections.websiteId');

    res.status(200).json({
      success: true,
      data: availableAds
    });

  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.selectAdForWebsite = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { adId, websiteId, categoryId } = req.body;
    const websiteOwnerId = req.user?.userId || req.user?.id || req.user?._id;

    await session.withTransaction(async () => {
      // Verify website ownership through category
      const category = await AdCategory.findOne({ 
        _id: categoryId,
        websiteId: websiteId,
        ownerId: websiteOwnerId.toString() 
      }).session(session);
      
      if (!category) {
        throw new Error('Category not found or unauthorized');
      }

      const ad = await ImportAd.findById(adId).session(session);
      if (!ad) {
        throw new Error('Ad not found');
      }

      // Check if already selected and active
      const existingSelection = ad.websiteSelections.find(ws => 
        ws.websiteId.toString() === websiteId.toString()
      );

      if (existingSelection && existingSelection.status === 'active') {
        throw new Error('Ad already active on this website');
      }

      // Add or update website selection
      if (existingSelection) {
        existingSelection.categories = [categoryId];
        existingSelection.status = 'pending';
        existingSelection.approved = false;
        existingSelection.rejectedAt = null;
        existingSelection.isRejected = false;
      } else {
        ad.websiteSelections.push({
          websiteId: websiteId,
          categories: [categoryId],
          approved: false,
          status: 'pending'
        });
      }

      await ad.save({ session });

      // Add ad to category's selectedAds if not already there
      if (!category.selectedAds.includes(adId)) {
        category.selectedAds.push(adId);
        await category.save({ session });
      }

      // TODO: Here you would handle the payment transfer from advertiser's budget to website owner's wallet
      // This involves checking if advertiser has enough budget, creating payment record, etc.
    });

    res.status(200).json({
      success: true,
      message: 'Ad selected for your website! Payment process will be handled automatically.',
      data: {
        adId: adId,
        websiteId: websiteId,
        categoryId: categoryId
      }
    });

  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to select ad' });
  } finally {
    await session.endSession();
  }
};

exports.getMyAds = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const ads = await ImportAd.find({ userId: userId })
      .populate('websiteSelections.websiteId')
      .populate('websiteSelections.categories')
      .sort({ createdAt: -1 });

    // Enhanced ads with reassignment info
    const enhancedAds = ads.map(ad => {
      const adObj = ad.toObject();
      
      // Check for rejected selections with refunds
      const rejectedSelections = adObj.websiteSelections.filter(ws => 
        ws.isRejected && ws.status === 'rejected'
      );
      
      // Check if ad has no website selections (never selected websites)
      const hasNoSelections = !adObj.websiteSelections || adObj.websiteSelections.length === 0;
      
      // Check if ad is available for reassignment
      const canReassign = adObj.availableForReassignment || hasNoSelections || rejectedSelections.length > 0;
      
      return {
        ...adObj,
        canReassign,
        rejectedSelections: rejectedSelections.length,
        hasNoSelections,
        availableRefundAmount: rejectedSelections.reduce((sum, ws) => {
          // This would need to be calculated from payment records
          return sum; // Placeholder - implement refund calculation
        }, 0)
      };
    });

    res.status(200).json({
      success: true,
      ads: enhancedAds
    });

  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};

exports.getAdRefundInfo = async (req, res) => {
  try {
    const { adId } = req.params;
    const userId = req.user.userId || req.user.id || req.user._id;
    
    // Verify ad ownership
    const ad = await ImportAd.findOne({ _id: adId, userId: userId });
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }
    
    // Find all refunded payments for this ad
    const refundedPayments = await Payment.find({
      adId: adId,
      status: 'refunded',
      advertiserId: userId
    });
    
    const totalRefundAmount = refundedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    res.status(200).json({
      success: true,
      data: {
        adId,
        totalRefundAmount,
        refundedPayments: refundedPayments.map(p => ({
          paymentId: p._id,
          amount: p.amount,
          websiteId: p.websiteId,
          categoryId: p.categoryId,
          refundedAt: p.refundedAt,
          refundReason: p.refundReason
        }))
      }
    });
    
  } catch (error) {
    console.error('Error fetching refund info:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};

exports.reassignAdWithRefund = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { adId } = req.params;
    const { selectedWebsites, selectedCategories } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    await session.withTransaction(async () => {
      // Verify ad ownership
      const ad = await ImportAd.findOne({ _id: adId, userId: userId }).session(session);
      if (!ad) {
        throw new Error('Ad not found');
      }

      // Parse selections
      let websitesArray, categoriesArray;
      try {
        websitesArray = typeof selectedWebsites === 'string' 
          ? JSON.parse(selectedWebsites) 
          : selectedWebsites;
        categoriesArray = typeof selectedCategories === 'string' 
          ? JSON.parse(selectedCategories) 
          : selectedCategories;
      } catch (parseError) {
        throw new Error('Invalid selection data format');
      }

      // Get categories and calculate costs
      const categories = await AdCategory.find({
        _id: { $in: categoriesArray }
      }).session(session);

      if (categories.length === 0) {
        throw new Error('No valid categories found');
      }

      // Create website-category mapping
      const websiteCategoryMap = categories.reduce((map, category) => {
        const websiteId = category.websiteId.toString();
        if (!map.has(websiteId)) {
          map.set(websiteId, []);
        }
        map.get(websiteId).push(category._id);
        return map;
      }, new Map());

      // Create new website selections
      const newWebsiteSelections = websitesArray.map(websiteId => {
        const websiteIdStr = websiteId.toString();
        const websiteCategories = websiteCategoryMap.get(websiteIdStr) || [];
        
        const validCategories = categoriesArray.filter(categoryId => 
          websiteCategories.some(webCatId => webCatId.toString() === categoryId.toString())
        );

        return {
          websiteId: websiteId,
          categories: validCategories,
          approved: false,
          approvedAt: null,
          status: 'pending'
        };
      }).filter(selection => selection.categories.length > 0);

      if (newWebsiteSelections.length === 0) {
        throw new Error('No valid website-category combinations found');
      }

      // Calculate total cost for new selections
      const totalNewCost = newWebsiteSelections.reduce((sum, selection) => {
        const category = categories.find(cat => 
          selection.categories.includes(cat._id) && 
          cat.websiteId.toString() === selection.websiteId.toString()
        );
        return sum + (category ? category.price : 0);
      }, 0);

      // Get available refund amount
      const refundedPayments = await Payment.find({
        adId: adId,
        status: 'refunded',
        advertiserId: userId
      }).session(session);

      const availableRefundAmount = refundedPayments.reduce((sum, payment) => sum + payment.amount, 0);

      // Filter out existing website selections to avoid duplicates
      const existingWebsiteIds = ad.websiteSelections
        .filter(ws => !ws.isRejected)
        .map(ws => ws.websiteId.toString());
      
      const selectionsToAdd = newWebsiteSelections.filter(selection => 
        !existingWebsiteIds.includes(selection.websiteId.toString())
      );

      if (selectionsToAdd.length === 0) {
        throw new Error('No new website selections to add');
      }

      // Add new selections to ad
      ad.websiteSelections.push(...selectionsToAdd);
      ad.availableForReassignment = false; // Reset flag
      await ad.save({ session });

      // Create payment selections with refund application
      const paymentSelections = selectionsToAdd.map(selection => {
        const category = categories.find(cat => 
          selection.categories.includes(cat._id) && 
          cat.websiteId.toString() === selection.websiteId.toString()
        );
        
        return {
          websiteId: selection.websiteId,
          categoryId: selection.categories[0],
          price: category ? category.price : 0,
          categoryName: category ? category.categoryName : 'Unknown',
          websiteName: 'Unknown' // This should be populated from website data
        };
      });

      // Calculate remaining amount to pay
      const remainingAmount = Math.max(0, totalNewCost - availableRefundAmount);
      const refundToUse = Math.min(availableRefundAmount, totalNewCost);

      res.status(200).json({
        success: true,
        message: 'Ad reassignment prepared successfully',
        data: {
          ad: ad,
          paymentSelections,
          totalCost: totalNewCost,
          availableRefundAmount,
          refundToUse,
          remainingAmountToPay: remainingAmount,
          requiresPayment: remainingAmount > 0
        }
      });
    });

  } catch (error) {
    console.error('Error in ad reassignment:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  } finally {
    await session.endSession();
  }
};

exports.getReassignableAds = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    const ads = await ImportAd.find({ 
      userId: userId,
      $or: [
        { availableForReassignment: true },
        { websiteSelections: { $size: 0 } }, // No website selections
        { 'websiteSelections.isRejected': true } // Has rejected selections
      ]
    })
    .populate('websiteSelections.websiteId')
    .populate('websiteSelections.categories')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      ads: ads
    });

  } catch (error) {
    console.error('Error fetching reassignable ads:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};

exports.getAdBudget = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    
    // Calculate budget from payments
    const payments = await Payment.find({ advertiserId: userId });
    
    const spent = payments
      .filter(p => p.status === 'successful')
      .reduce((sum, p) => sum + p.amount, 0);
    
    const refunded = payments
      .filter(p => p.status === 'refunded')
      .reduce((sum, p) => sum + p.amount, 0);
    
    // Simple available budget calculation (you can make this more sophisticated)
    const available = 1000; // Placeholder - implement your budget logic

    res.status(200).json({
      success: true,
      budget: {
        available,
        spent,
        refunded
      }
    });

  } catch (error) {
    console.error('Error fetching ad budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
};

exports.getUserMixedAds = async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch ads with populated website selections
    const mixedAds = await ImportAd.find({ userId })
      .populate({
        path: 'websiteSelections.websiteId',
        select: 'websiteName websiteLink logoUrl'
      })
      .populate({
        path: 'websiteSelections.categories',
        select: 'price ownerId categoryName'
      });

    const adsWithDetails = mixedAds.map(ad => {
      // Calculate total price across all website selections and their categories
      const totalPrice = ad.websiteSelections.reduce((sum, selection) => {
        const categoryPriceSum = selection.categories.reduce((catSum, category) => 
          catSum + (category.price || 0), 0);
        return sum + categoryPriceSum;
      }, 0);

      return {
        ...ad.toObject(),
        totalPrice,
        isConfirmed: ad.confirmed,
        // Get unique owner IDs across all categories
        categoryOwnerIds: [...new Set(ad.websiteSelections.flatMap(selection => 
          selection.categories.map(cat => cat.ownerId)))],
        clicks: ad.clicks,
        views: ad.views,
        status: ad.websiteSelections.every(sel => sel.approved) ? 'approved' : 'pending'
      };
    });

    res.status(200).json(adsWithDetails);
  } catch (error) {
    console.error('Error fetching mixed ads:', error);
    res.status(500).json({ message: 'Failed to fetch ads', error: error.message });
  }
};