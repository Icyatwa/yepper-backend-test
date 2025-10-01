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

// PaymentController.js
const crypto = require('crypto');
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
const User = require('../../models/User');
const Payment = require('../models/PaymentModel');
const ImportAd = require('../models/WebAdvertiseModel');
const AdCategory = require('../../AdPromoter/models/CreateCategoryModel');
const Website = require('../../AdPromoter/models/CreateWebsiteModel');
const { Wallet, WalletTransaction } = require('../../AdPromoter/models/walletModel');
const mongoose = require('mongoose');

const flw = new Flutterwave(process.env.FLW_TEST_PUBLIC_KEY, process.env.FLW_TEST_SECRET_KEY);

const retryTransaction = async (operation, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    
    try {
      const result = await session.withTransaction(operation, {
        readConcern: { level: "majority" },
        writeConcern: { w: "majority", j: true },
        readPreference: 'primary',
        maxCommitTimeMS: 30000 // 30 seconds timeout
      });
      
      await session.endSession();
      return result;
      
    } catch (error) {
      await session.endSession();
      
      // Check if it's a transient transaction error that can be retried
      if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError') && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Transaction failed (attempt ${attempt}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
};

exports.initiatePayment = async (req, res) => {
  try {
    const { adId, websiteId, categoryId } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    // Get ad and category details
    const ad = await ImportAd.findById(adId);
    const category = await AdCategory.findById(categoryId).populate('websiteId');
    const website = await Website.findById(websiteId);

    if (!ad || !category || !website) {
      return res.status(404).json({ error: 'Ad, category, or website not found' });
    }

    // Verify the ad belongs to the user
    if (ad.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to ad' });
    }

    // Check if this combination is already paid
    const existingSelection = ad.websiteSelections.find(
      sel => sel.websiteId.toString() === websiteId && 
             sel.categories.includes(categoryId) &&
             ['paid', 'active'].includes(sel.status)
    );

    if (existingSelection) {
      return res.status(400).json({ error: 'This ad space is already paid for' });
    }

    const amount = category.price;
    const tx_ref = `ad_${adId}_${websiteId}_${categoryId}_${Date.now()}`;
    
    const paymentData = {
      tx_ref: tx_ref,
      amount: amount,
      currency: 'USD',
      redirect_url: `${process.env.FRONTEND_URL}/payment/callback`,
      customer: {
        email: ad.adOwnerEmail,
        name: ad.businessName
      },
      customizations: {
        title: `Advertisement on ${website.websiteName}`,
        description: `Payment for ad space: ${category.categoryName}`,
        logo: process.env.LOGO_URL || ""
      },
      meta: {
        adId: adId,
        websiteId: websiteId,
        categoryId: categoryId,
        webOwnerId: website.ownerId,
        advertiserId: userId
      }
    };

    // Direct API call to Flutterwave
    const apiResponse = await axios.post('https://api.flutterwave.com/v3/payments', paymentData, {
      headers: {
        'Authorization': `Bearer ${process.env.FLW_TEST_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const response = {
      status: apiResponse.data.status,
      data: apiResponse.data.data
    };

    if (response.status === 'success') {
      // Create payment record with both tx_ref and temporary paymentId
      const payment = new Payment({
        paymentId: tx_ref, // Will be updated with actual transaction ID after verification
        tx_ref: tx_ref, // Store the transaction reference
        adId: adId,
        advertiserId: userId,
        webOwnerId: website.ownerId,
        websiteId: websiteId,
        categoryId: categoryId,
        amount: amount,
        status: 'pending',
        flutterwaveData: response.data
      });

      await payment.save();

      res.status(200).json({
        success: true,
        paymentUrl: response.data.link,
        paymentId: payment._id,
        tx_ref: tx_ref
      });
    } else {
      res.status(400).json({ error: 'Payment initiation failed', details: response });
    }

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { transaction_id, tx_ref } = req.body;
    
    // Use tx_ref if transaction_id is not provided
    const identifier = transaction_id || tx_ref;
    
    if (!identifier) {
      return res.status(400).json({ error: 'Transaction ID or reference required' });
    }

    // Verify with Flutterwave first (outside transaction)
    const response = await flw.Transaction.verify({ id: identifier });

    if (response.status === 'success' && response.data.status === 'successful') {
      // Find payment by tx_ref first, then by paymentId (outside transaction)
      let payment = await Payment.findOne({ 
        $or: [
          { tx_ref: response.data.tx_ref },
          { paymentId: identifier }
        ]
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment record not found' });
      }

      // Check if already processed
      if (payment.status === 'successful') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: payment 
        });
      }

      // Execute the database operations with retry logic
      const result = await retryTransaction(async (session) => {
        // Re-fetch payment within transaction to avoid stale data
        const currentPayment = await Payment.findById(payment._id).session(session);
        
        if (!currentPayment) {
          throw new Error('Payment not found during transaction');
        }

        // Double-check status within transaction
        if (currentPayment.status === 'successful') {
          return { alreadyProcessed: true, payment: currentPayment };
        }

        // Update payment with actual Flutterwave transaction ID
        currentPayment.paymentId = response.data.id;
        currentPayment.status = 'successful';
        currentPayment.paidAt = new Date();
        currentPayment.flutterwaveData.set('verification', response.data);
        await currentPayment.save({ session });

        // Get required data
        const ad = await ImportAd.findById(currentPayment.adId).session(session);
        const website = await Website.findById(currentPayment.websiteId).session(session);
        const category = await AdCategory.findById(currentPayment.categoryId).session(session);

        if (!ad || !website || !category) {
          throw new Error('Required documents not found');
        }

        // Handle advertiser wallet
        const advertiser = await User.findById(currentPayment.advertiserId).session(session);
        if (!advertiser) {
          throw new Error('Advertiser not found');
        }

        await Wallet.findOneAndUpdate(
          { ownerId: currentPayment.advertiserId, ownerType: 'advertiser' },
          {
            $inc: { totalSpent: currentPayment.amount },
            $setOnInsert: {
              ownerId: currentPayment.advertiserId,
              ownerEmail: advertiser.email,
              ownerType: 'advertiser',
              balance: 0,
              totalEarned: 0,
              totalRefunded: 0
            },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true, session }
        );

        // Update ad website selection
        const selectionIndex = ad.websiteSelections.findIndex(
          sel => sel.websiteId.toString() === currentPayment.websiteId.toString() &&
                 sel.categories.includes(currentPayment.categoryId)
        );

        const rejectionDeadline = new Date();
        rejectionDeadline.setMinutes(rejectionDeadline.getMinutes() + 2);

        if (selectionIndex !== -1) {
          ad.websiteSelections[selectionIndex].status = 'active';
          ad.websiteSelections[selectionIndex].approved = true;
          ad.websiteSelections[selectionIndex].approvedAt = new Date();
          ad.websiteSelections[selectionIndex].publishedAt = new Date();
          ad.websiteSelections[selectionIndex].paymentId = currentPayment._id;
          ad.websiteSelections[selectionIndex].rejectionDeadline = rejectionDeadline;
        } else {
          ad.websiteSelections.push({
            websiteId: currentPayment.websiteId,
            categories: [currentPayment.categoryId],
            approved: true,
            approvedAt: new Date(),
            publishedAt: new Date(),
            paymentId: currentPayment._id,
            status: 'active',
            rejectionDeadline: rejectionDeadline
          });
        }

        // Check if all selections are approved
        const allApproved = ad.websiteSelections.every(sel => sel.approved);
        if (allApproved) {
          ad.confirmed = true;
        }

        await ad.save({ session });

        // Add ad to category's selectedAds (use $addToSet to avoid duplicates)
        await AdCategory.findByIdAndUpdate(
          currentPayment.categoryId,
          { $addToSet: { selectedAds: currentPayment.adId } },
          { session }
        );

        // Handle web owner wallet with proper email fallback
        const ownerEmail = category.webOwnerEmail || website.ownerEmail;
        if (!ownerEmail) {
          // Try to get owner email from user collection
          const webOwner = await User.findById(currentPayment.webOwnerId).session(session);
          if (!webOwner) {
            throw new Error('Website owner information not found');
          }
          ownerEmail = webOwner.email;
        }

        // Update web owner wallet
        const webOwnerWallet = await Wallet.findOneAndUpdate(
          { ownerId: currentPayment.webOwnerId, ownerType: 'webOwner' },
          {
            $inc: { 
              balance: currentPayment.amount,
              totalEarned: currentPayment.amount
            },
            $setOnInsert: {
              ownerId: currentPayment.webOwnerId,
              ownerEmail: ownerEmail,
              ownerType: 'webOwner',
              totalSpent: 0,
              totalRefunded: 0
            },
            $set: { lastUpdated: new Date() }
          },
          {
            upsert: true,
            new: true,
            session
          }
        );

        // Create wallet transaction
        const walletTransaction = new WalletTransaction({
          walletId: webOwnerWallet._id,
          paymentId: currentPayment._id,
          adId: currentPayment.adId,
          amount: currentPayment.amount,
          type: 'credit',
          description: `Payment for ad: ${ad.businessName} on category: ${category.categoryName}`
        });

        await walletTransaction.save({ session });

        return { success: true, payment: currentPayment };
      });

      // Handle the result
      if (result.alreadyProcessed) {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: result.payment 
        });
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified and ad published successfully',
        payment: result.payment
      });

    } else {
      // Payment failed - update status (no transaction needed for this)
      await Payment.findOneAndUpdate(
        { 
          $or: [
            { tx_ref: identifier },
            { paymentId: identifier },
            { tx_ref: response.data?.tx_ref }
          ]
        },
        { 
          status: 'failed',
          flutterwaveData: response.data 
        }
      );

      res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed',
        details: response.data 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error.code === 251) { // NoSuchTransaction
      errorMessage = 'Transaction was aborted due to conflicts. Please try again.';
      statusCode = 409; // Conflict
    } else if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
      errorMessage = 'Temporary transaction error. Please try again.';
      statusCode = 503; // Service Temporarily Unavailable
    }
    
    res.status(statusCode).json({ 
      error: errorMessage, 
      message: error.message,
      retryable: error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')
    });
  }
};

// Categories.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Check,
  DollarSign,
  ArrowLeft,
  Eye,
  CreditCard,
  ShoppingCart
} from 'lucide-react';
import axios from 'axios';
import { Button, Text, Heading, Container, Badge } from '../../components/components';
import LoadingSpinner from '../../components/LoadingSpinner';

const Categories = () => {
  const [user, setUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const getInitialData = () => {
    if (location.state && Object.keys(location.state).length > 0) {
      return location.state;
    }
    
    const savedData = localStorage.getItem('adFormData');
    if (savedData) {
      return JSON.parse(savedData);
    }
    
    return {};
  };

  const initialData = getInitialData();
  const { 
    file,
    businessName,
    businessLink,
    businessLocation,
    adDescription,
    selectedWebsites
  } = initialData;

  const [categoriesByWebsite, setCategoriesByWebsite] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState(
    initialData.selectedCategories || []
  );
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [adCreated, setAdCreated] = useState(null);
  const [fileObject, setFileObject] = useState(null);
  
  useEffect(() => {
    const loadFileFromStorage = async () => {
      if (file && file.data && !fileObject) {
        try {
          const response = await fetch(file.data);
          const blob = await response.blob();
          const restoredFile = new File([blob], file.name, {
            type: file.type
          });
          setFileObject(restoredFile);
        } catch (error) {
          console.error('Failed to restore file:', error);
        }
      } else if (file instanceof File) {
        setFileObject(file);
      }
    };
    
    loadFileFromStorage();
  }, [file]);

  useEffect(() => {
    if (businessName) {
      const dataToSave = {
        ...initialData,
        selectedCategories
      };
      localStorage.setItem('adFormData', JSON.stringify(dataToSave));
    }
  }, [selectedCategories, businessName]);

  // Redirect if no business data
  useEffect(() => {
    const savedData = localStorage.getItem('adFormData');
    if (!savedData && !businessName) {
      navigate('/insert-data');
    }
  }, [businessName, navigate]);

  const getAdSpaceImage = (categoryName) => {
    const normalizedName = categoryName.toLowerCase().replace(/\s+/g, '');
    
    const imageMap = {
      'abovethefold': AboveTheFold,
      'beneathtitle': BeneathTitle,
      'bottom': Bottom,
      'floating': Floating,
      'header': HeaderPic,
      'infeed': InFeed,
      'inlinecontent': InlineContent,
      'leftrail': LeftRail,
      'mobileinterstitial': MobileInterstial,
      'modal': ModalPic,
      'overlay': Overlay,
      'profooter': ProFooter,
      'rightrail': RightRail,
      'sidebar': Sidebar,
      'stickysidebar': StickySidebar
    };

    return imageMap[normalizedName] || null;
  };

  const getAuthToken = () => {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  };

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  useEffect(() => {
    const fetchUserInfo = async () => {
      const token = getAuthToken();
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const response = await axios.get('http://localhost:5000/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        setUser(response.data.user);
      } catch (error) {
        console.error('Failed to fetch user info:', error);
        navigate('/login');
      }
    };

    fetchUserInfo();
  }, [navigate]);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const promises = selectedWebsites.map(async (websiteId) => {
          const websiteResponse = await fetch(`http://localhost:5000/api/createWebsite/website/${websiteId}`);
          const websiteData = await websiteResponse.json();
          
          const categoriesResponse = await fetch(
            `http://localhost:5000/api/ad-categories/${websiteId}/advertiser`,
            {
              headers: getAuthHeaders()
            }
          );
          
          if (!categoriesResponse.ok) {
            if (categoriesResponse.status === 401) {
              console.error('Authentication required. Please log in.');
              navigate('/login');
              return;
            }
            throw new Error(`HTTP error! status: ${categoriesResponse.status}`);
          }
          
          const categoriesData = await categoriesResponse.json();

          return {
            websiteId: websiteId,
            websiteName: websiteData.websiteName || 'Unknown Website',
            websiteLink: websiteData.websiteLink || '#',
            categories: categoriesData.categories || [],
          };
        });
        
        const result = await Promise.all(promises);
        setCategoriesByWebsite(result.filter(Boolean));
        
      } catch (error) {
        console.error('Failed to fetch categories or websites:', error);
        setError('Failed to load categories. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    const token = getAuthToken();
    if (!token) {
      console.error('No authentication token found');
      navigate('/login');
      return;
    }

    if (selectedWebsites) fetchCategories();
  }, [selectedWebsites, navigate]);

  useEffect(() => {
    const calculateTotal = () => {
      let total = 0;
      selectedCategories.forEach(categoryId => {
        categoriesByWebsite.forEach(website => {
          const category = website.categories.find(cat => cat._id === categoryId);
          if (category) {
            total += category.price;
          }
        });
      });
      setTotalCost(total);
    };

    calculateTotal();
  }, [selectedCategories, categoriesByWebsite]);

  const handleCategorySelection = (categoryId) => {
    setSelectedCategories((prevSelected) =>
      prevSelected.includes(categoryId) 
        ? prevSelected.filter((id) => id !== categoryId) 
        : [...prevSelected, categoryId]
    );
    setError(false);
  };

  const toggleCategoryExpansion = (categoryId) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  const getSelectedCategoryDetails = () => {
    const details = [];
    selectedCategories.forEach(categoryId => {
      categoriesByWebsite.forEach(website => {
        const category = website.categories.find(cat => cat._id === categoryId);
        if (category) {
          details.push({
            categoryId: category._id,
            websiteId: website.websiteId,
            websiteName: website.websiteName,
            categoryName: category.categoryName,
            price: category.price
          });
        }
      });
    });
    return details;
  };

  const handleCreateAd = async () => {
    if (selectedCategories.length === 0) {
      setError(true);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append('adOwnerEmail', user?.email);
      
      // Use the restored File object
      if (fileObject) {
        formData.append('file', fileObject);
      } else if (file instanceof File) {
        formData.append('file', file);
      }
      
      formData.append('businessName', businessName);
      formData.append('businessLink', businessLink);
      formData.append('businessLocation', businessLocation);
      formData.append('adDescription', adDescription);
      formData.append('selectedWebsites', JSON.stringify(selectedWebsites));
      formData.append('selectedCategories', JSON.stringify(selectedCategories));

      const token = getAuthToken();
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      };

      const response = await axios.post('http://localhost:5000/api/web-advertise', formData, config);

      if (response.data.success) {
        setAdCreated(response.data.data);
        setShowPaymentSummary(true);
      }
      
    } catch (error) {
      console.error('Error during ad creation:', error);
      
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        navigate('/login');
        return;
      }
      
      const errorMessage = error.response?.data?.message || 'An error occurred while creating the ad';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayment = async (selection) => {
    try {
      const token = getAuthToken();
      const response = await axios.post('http://localhost:5000/api/web-advertise/payment/initiate', {
        adId: adCreated._id,
        websiteId: selection.websiteId,
        categoryId: selection.categoryId
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        // Clear saved data only when payment is initiated
        localStorage.removeItem('adFormData');
        window.location.href = response.data.paymentUrl;
      }
    } catch (error) {
      console.error('Payment initiation error:', error);
      setError('Failed to initiate payment. Please try again.');
    }
  };

  if (!user && getAuthToken()) {
    return <LoadingSpinner />;
  }

  // Payment Summary Modal
  if (showPaymentSummary && adCreated) {
    const paymentSelections = getSelectedCategoryDetails();
    
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b border-gray-200 bg-white">
          <Container>
            <div className="h-16 flex items-center justify-between">
              <button 
                onClick={() => {
                  setShowPaymentSummary(false);
                  setAdCreated(null);
                  setError(false);
                }} 
                className="flex items-center text-gray-600 hover:text-black transition-colors"
              >
                <ArrowLeft size={18} className="mr-2" />
                <span className="font-medium">Back to Edit Selections</span>
              </button>
              <Badge variant="default">Complete Your Payment</Badge>
            </div>
          </Container>
        </header>

        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <Heading level={2} className="mb-2">Ad Created Successfully!</Heading>
            <Text variant="muted">
              Now complete payment for each ad placement to publish your ad
            </Text>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-6 mb-8">
            <Heading level={3} className="mb-4">Ad Summary</Heading>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className='flex gap-2'>
                <Text className="font-medium">Business:</Text>
                <Text>{businessName}</Text>
              </div>
              <div className='flex gap-2'>
                <Text className="font-medium">Location:</Text>
                <Text>{businessLocation}</Text>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {paymentSelections.map((selection, index) => (
              <div key={index} className="border border-gray-300 bg-white p-6">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <Heading level={4} className="mb-1">{selection.websiteName}</Heading>
                    <Text variant="muted" className="mb-2">{selection.categoryName}</Text>
                    <div className="flex items-center gap-2">
                      <Text className="text-lg font-semibold">${selection.price}</Text>
                    </div>
                  </div>
                  <Button
                    onClick={() => handlePayment(selection)}
                    variant="secondary"
                  >
                    Pay Now
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 pt-6 mt-8">
            <div className="flex justify-between items-center mb-4">
              <Heading level={3}>Total Cost</Heading>
              <div className="flex items-center gap-2">
                <Text className="text-2xl font-bold">${totalCost}</Text>
              </div>
            </div>
            <Text variant="muted" className="text-center">
              Pay for each ad placement individually. Your ads will go live immediately after payment confirmation.
            </Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <Container>
          <div className="h-16 flex items-center justify-between">
            <button 
              onClick={() => navigate(-1)} 
              className="flex items-center text-gray-600 hover:text-black transition-colors"
            >
              <ArrowLeft size={18} className="mr-2" />
              <span className="font-medium">Back</span>
            </button>
            <Badge variant="default">Choose Where Your Ad Will Appear</Badge>
          </div>
        </Container>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Info Banner */}
        <div className="py-6">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-gray-600 max-w-2xl">
                Choose where you want your advertisement to appear on each website. 
                Each location shows exactly where visitors will see your ad.
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="border border-red-600 bg-red-50 p-4 mb-8">
            <div className="flex items-center gap-3">
              <Text variant="error">
                {typeof error === 'string' ? error : 'Please select at least one ad placement to proceed'}
              </Text>
            </div>
          </div>
        )}

        {/* Categories Grid */}
        {categoriesByWebsite.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {categoriesByWebsite.map((website) => (
              <div key={website.websiteName} className="border border-black bg-white">
                {/* Website Header */}
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <Heading level={3} className="mb-1">{website.websiteName}</Heading>
                      <Text variant="muted">Available ad placements on this website</Text>
                    </div>
                    <a 
                      href={website.websiteLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        iconPosition="left"
                      >
                        Visit Site
                      </Button>
                    </a>
                  </div>
                </div>
                
                {/* Categories */}
                {website.categories.length > 0 ? (
                  <div className="p-6 space-y-6">
                    {website.categories.map((category) => {
                      const adImage = getAdSpaceImage(category.categoryName);
                      const isExpanded = expandedCategory === category._id;
                      const isSelected = selectedCategories.includes(category._id);
                      // Allow re-selection of categories if they're currently selected
                      const isActuallyFullyBooked = category.isFullyBooked && !isSelected;
                      
                      return (
                        <div
                          key={category._id}
                          className={`border transition-all duration-200 bg-white relative ${
                            isSelected ? 'border-black shadow-md' : 'border-gray-300'
                          } ${isActuallyFullyBooked ? 'opacity-60' : ''}`}
                        >
                          {isActuallyFullyBooked && (
                            <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 text-xs font-medium z-10">
                              FULLY BOOKED
                            </div>
                          )}
                          
                          {/* Main Content */}
                          <div
                            onClick={() => !isActuallyFullyBooked && handleCategorySelection(category._id)}
                            className={`p-6 ${isActuallyFullyBooked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                          >
                            <div className={`grid gap-6 items-center ${adImage ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-4'}`}>
                              {/* Ad Preview Image */}
                              {adImage && (
                                <div className="w-full h-32 border border-gray-300 bg-gray-50 overflow-hidden">
                                  <img 
                                    src={adImage} 
                                    alt={`${category.categoryName} placement preview`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              
                              {/* Category Info */}
                              <div className={adImage ? 'md:col-span-2' : 'md:col-span-3'}>
                                <div className="flex items-center gap-3 mb-3">
                                  <Heading level={4}>{category.categoryName}</Heading>
                                </div>
                                
                                <Text className="mb-4">
                                  {category.description.length > 80 
                                    ? `${category.description.substring(0, 80)}...`
                                    : category.description
                                  }
                                </Text>

                                <div className="flex items-center gap-6">
                                  <div className="flex items-center justify-center gap-2">
                                    <span className="text-lg font-semibold text-black">
                                      ${category.price}
                                    </span>
                                  </div>
                                  
                                  {category.description.length > 80 && (
                                    <Button 
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCategoryExpansion(category._id);
                                      }}
                                      icon={Eye}
                                      iconPosition="left"
                                    >
                                      {isExpanded ? 'Show Less' : 'Read More'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                              
                              {/* Selection Indicator */}
                              <div className="text-center">
                                <div className={`w-10 h-10 border-2 flex items-center justify-center mx-auto mb-2 transition-colors ${
                                  isSelected ? 'bg-black border-black' : 'border-gray-300'
                                }`}>
                                  {isSelected && <Check size={20} className="text-white" />}
                                </div>
                                <Text 
                                  variant="small" 
                                  className={`font-medium ${isSelected ? 'text-black' : 'text-gray-500'}`}
                                >
                                  {isSelected ? 'SELECTED' : 'SELECT'}
                                </Text>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Description */}
                          {isExpanded && (
                            <div className="px-6 pb-6 border-t border-gray-200">
                              <Text className="pt-4">{category.description}</Text>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <Heading level={4} className="mb-2">No Ad Spaces Available</Heading>
                    <Text variant="muted">
                      This website doesn't have any available ad placements right now. Check back later!
                    </Text>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <Heading level={2} className="mb-4">No Ad Spaces Found</Heading>
            <Text variant="muted" className="mb-8">
              The selected websites don't have any available ad placements. 
              Please try selecting different websites.
            </Text>
          </div>
        )}
        
        {/* Footer Actions */}
        <div className="border-t border-gray-200 pt-8 text-center">
          <Button 
            onClick={handleCreateAd}
            disabled={selectedCategories.length === 0 || isSubmitting}
            loading={isSubmitting}
            variant="secondary"
            size="lg"
          >
            {isSubmitting ? 'Creating Ad...' : selectedCategories.length > 0 ? `Continue to Payment` : 'Select Ad Spaces to Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Categories;