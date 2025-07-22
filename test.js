
import React, { useState } from 'react';
import { ChevronRight, Check, ArrowLeft, Building2, Code, Utensils, Home, Car, Heart, Gamepad2, Shirt, BookOpen, Briefcase, Plane, Music, Camera, Gift, Shield, Zap } from 'lucide-react';

function BusinessCategorySelection() {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Mock website details for demo
  const websiteDetails = { name: 'My Tech Blog', id: '123' };

  const businessCategories = [
    { id: 'any', name: 'Any Category', description: 'Accept all types of advertisements', icon: Zap },
    { id: 'technology', name: 'Technology', description: 'Software, hardware, IT services, apps', icon: Code },
    { id: 'food-beverage', name: 'Food & Beverage', description: 'Restaurants, cafes, food delivery, drinks', icon: Utensils },
    { id: 'real-estate', name: 'Real Estate', description: 'Property sales, rentals, construction', icon: Home },
    { id: 'automotive', name: 'Automotive', description: 'Cars, motorcycles, auto services', icon: Car },
    { id: 'health-wellness', name: 'Health & Wellness', description: 'Healthcare, fitness, beauty, pharmacy', icon: Heart },
    { id: 'entertainment', name: 'Entertainment', description: 'Gaming, movies, events, streaming', icon: Gamepad2 },
    { id: 'fashion', name: 'Fashion & Retail', description: 'Clothing, accessories, shopping', icon: Shirt },
    { id: 'education', name: 'Education', description: 'Schools, courses, training, books', icon: BookOpen },
    { id: 'business-services', name: 'Business Services', description: 'Consulting, marketing, finance, legal', icon: Briefcase },
    { id: 'travel-tourism', name: 'Travel & Tourism', description: 'Hotels, flights, tours, travel gear', icon: Plane },
    { id: 'arts-culture', name: 'Arts & Culture', description: 'Music, art, museums, cultural events', icon: Music },
    { id: 'photography', name: 'Photography', description: 'Wedding, portrait, commercial photography', icon: Camera },
    { id: 'gifts-events', name: 'Gifts & Events', description: 'Party planning, gifts, celebrations', icon: Gift },
    { id: 'government-public', name: 'Government & Public Services', description: 'Public services, government announcements', icon: Shield },
    { id: 'general-retail', name: 'General Retail', description: 'Various products and services', icon: Building2 }
  ];

  const handleCategoryToggle = (categoryId) => {
    if (categoryId === 'any') {
      // If "Any" is selected, clear all other selections and only keep "Any"
      if (selectedCategories.includes('any')) {
        setSelectedCategories([]);
      } else {
        setSelectedCategories(['any']);
      }
    } else {
      // If any specific category is selected, remove "Any" if it exists
      let newSelection = selectedCategories.filter(id => id !== 'any');
      
      if (newSelection.includes(categoryId)) {
        newSelection = newSelection.filter(id => id !== categoryId);
      } else {
        newSelection = [...newSelection, categoryId];
      }
      
      setSelectedCategories(newSelection);
    }
  };

  const handleSubmit = async () => {
    if (selectedCategories.length === 0) {
      setError('Please select at least one business category');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Mock API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate successful submission
      alert(`Categories saved: ${selectedCategories.join(', ')}`);
      
    } catch (error) {
      setError('Failed to update business categories');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    // Mock navigation - replace with actual router navigation
    console.log('Navigate back');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Choose Business Categories
            </h1>
            <p className="text-gray-600 mb-4">
              Select the types of businesses you want to advertise on your website: <strong>{websiteDetails.name}</strong>
            </p>
            <div className="text-sm text-gray-500">
              You can choose specific categories or select "Any Category" to accept all types of advertisements.
            </div>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Available Categories</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {businessCategories.map((category) => {
              const Icon = category.icon;
              const isSelected = selectedCategories.includes(category.id);
              const isAnySelected = selectedCategories.includes('any');
              const isDisabled = isAnySelected && category.id !== 'any';

              return (
                <div
                  key={category.id}
                  onClick={() => !isDisabled && handleCategoryToggle(category.id)}
                  className={`
                    relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                    ${isSelected 
                      ? 'border-blue-500 bg-blue-50' 
                      : isDisabled 
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }
                    ${category.id === 'any' ? 'ring-2 ring-orange-200' : ''}
                  `}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`
                      p-2 rounded-lg
                      ${isSelected 
                        ? 'bg-blue-500 text-white' 
                        : category.id === 'any'
                          ? 'bg-orange-100 text-orange-600'
                          : 'bg-gray-100 text-gray-600'
                      }
                    `}>
                      <Icon className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className={`
                        font-medium text-sm
                        ${isSelected ? 'text-blue-900' : 'text-gray-900'}
                      `}>
                        {category.name}
                      </h3>
                      <p className={`
                        text-xs mt-1 line-clamp-2
                        ${isSelected ? 'text-blue-700' : 'text-gray-500'}
                      `}>
                        {category.description}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="bg-blue-500 text-white rounded-full p-1">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selection Summary */}
          {selectedCategories.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-medium text-blue-900 mb-2">Selected Categories:</h3>
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((categoryId) => {
                  const category = businessCategories.find(c => c.id === categoryId);
                  return (
                    <span
                      key={categoryId}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {category?.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {selectedCategories.length === 0 
                ? 'No categories selected'
                : `${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'} selected`
              }
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={selectedCategories.length === 0 || isSubmitting}
              className={`
                flex items-center px-6 py-2 rounded-lg font-medium transition-all duration-200
                ${selectedCategories.length > 0 && !isSubmitting
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BusinessCategorySelection;






























// CreateWebsiteModel.js
const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteName: { type: String, required: true },
  websiteLink: { type: String, required: true, unique: true },
  imageUrl: { type: String },
  businessCategories: {
    type: [String],
    enum: [
      'any',
      'technology',
      'food-beverage',
      'real-estate',
      'automotive',
      'health-wellness',
      'entertainment',
      'fashion',
      'education',
      'business-services',
      'travel-tourism',
      'arts-culture',
      'photography',
      'gifts-events',
      'government-public',
      'general-retail'
    ],
    default: []
  },
  isBusinessCategoriesSelected: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

websiteSchema.index({ ownerId: 1 });
websiteSchema.index({ businessCategories: 1 });

module.exports = mongoose.model('Website', websiteSchema);






























// businessCategoriesController.js
const Website = require('../models/CreateWebsiteModel');
const User = require('../../models/User');
const jwt = require('jsonwebtoken');

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

const validCategories = [
  'any',
  'technology',
  'food-beverage',
  'real-estate',
  'automotive',
  'health-wellness',
  'entertainment',
  'fashion',
  'education',
  'business-services',
  'travel-tourism',
  'arts-culture',
  'photography',
  'gifts-events',
  'government-public',
  'general-retail'
];

exports.updateBusinessCategories = [authenticateToken, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { businessCategories } = req.body;
    const userId = req.user._id.toString();

    // Validation
    if (!businessCategories || !Array.isArray(businessCategories)) {
      return res.status(400).json({ 
        message: 'businessCategories must be an array' 
      });
    }

    if (businessCategories.length === 0) {
      return res.status(400).json({ 
        message: 'At least one business category must be selected' 
      });
    }

    // Validate categories
    const invalidCategories = businessCategories.filter(cat => !validCategories.includes(cat));
    if (invalidCategories.length > 0) {
      return res.status(400).json({ 
        message: `Invalid categories: ${invalidCategories.join(', ')}` 
      });
    }

    // If "any" is selected, it should be the only selection
    if (businessCategories.includes('any') && businessCategories.length > 1) {
      return res.status(400).json({ 
        message: 'If "any" category is selected, no other categories should be selected' 
      });
    }

    // Find and verify website ownership
    const website = await Website.findOne({ 
      _id: websiteId,
      ownerId: userId 
    });

    if (!website) {
      return res.status(404).json({ 
        message: 'Website not found or you do not have permission to modify it' 
      });
    }

    // Update website with business categories
    const updatedWebsite = await Website.findByIdAndUpdate(
      websiteId,
      { 
        businessCategories: businessCategories,
        isBusinessCategoriesSelected: true
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Business categories updated successfully',
      website: updatedWebsite
    });

  } catch (error) {
    console.error('Error updating business categories:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }

    res.status(500).json({ 
      message: 'Failed to update business categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}];

exports.getBusinessCategories = [authenticateToken, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const userId = req.user._id.toString();

    const website = await Website.findOne({ 
      _id: websiteId,
      ownerId: userId 
    }).select('businessCategories isBusinessCategoriesSelected websiteName');

    if (!website) {
      return res.status(404).json({ 
        message: 'Website not found or you do not have permission to access it' 
      });
    }

    res.status(200).json({
      success: true,
      data: {
        websiteId: website._id,
        websiteName: website.websiteName,
        businessCategories: website.businessCategories,
        isBusinessCategoriesSelected: website.isBusinessCategoriesSelected
      }
    });

  } catch (error) {
    console.error('Error fetching business categories:', error);
    res.status(500).json({ 
      message: 'Failed to fetch business categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}];

// Complete the getAllValidCategories function
exports.getAllValidCategories = (req, res) => {
  const categoryDetails = [
    { id: 'any', name: 'Any Category', description: 'Accept all types of advertisements' },
    { id: 'technology', name: 'Technology', description: 'Software, hardware, IT services, apps' },
    { id: 'food-beverage', name: 'Food & Beverage', description: 'Restaurants, cafes, food delivery, drinks' },
    { id: 'real-estate', name: 'Real Estate', description: 'Property sales, rentals, construction' },
    { id: 'automotive', name: 'Automotive', description: 'Cars, motorcycles, auto services' },
    { id: 'health-wellness', name: 'Health & Wellness', description: 'Healthcare, fitness, beauty, pharmacy' },
    { id: 'entertainment', name: 'Entertainment', description: 'Gaming, movies, events, streaming' },
    { id: 'fashion', name: 'Fashion & Retail', description: 'Clothing, accessories, shopping' },
    { id: 'education', name: 'Education', description: 'Schools, courses, training, books' },
    { id: 'business-services', name: 'Business Services', description: 'Consulting, marketing, finance, legal' },
    { id: 'travel-tourism', name: 'Travel & Tourism', description: 'Hotels, flights, tours, travel gear' },
    { id: 'arts-culture', name: 'Arts & Culture', description: 'Music, art, museums, cultural events' },
    { id: 'photography', name: 'Photography', description: 'Wedding, portrait, commercial photography' },
    { id: 'gifts-events', name: 'Gifts & Events', description: 'Party planning, gifts, celebrations' },
    { id: 'government-public', name: 'Government & Public Services', description: 'Public services, government announcements' },
    { id: 'general-retail', name: 'General Retail', description: 'Various products and services' }
  ];

  res.status(200).json({
    success: true,
    data: {
      categories: categoryDetails,
      validIds: validCategories
    }
  });
};













// routes/businessCategoriesRoutes.js
const express = require('express');
const router = express.Router();
const businessCategoriesController = require('../controllers/businessCategoriesController');

// Get all valid categories (public route)
router.get('/categories', businessCategoriesController.getAllValidCategories);

// Get business categories for a specific website
router.get('/website/:websiteId', businessCategoriesController.getBusinessCategories);

// Update business categories for a website
router.put('/website/:websiteId', businessCategoriesController.updateBusinessCategories);

module.exports = router;





















import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, Check, ArrowLeft, Building2, Code, Utensils, Home, Car, Heart, Gamepad2, Shirt, BookOpen, Briefcase, Plane, Music, Camera, Gift, Shield, Zap } from 'lucide-react';
import axios from 'axios';

function BusinessCategorySelection() {
  const { websiteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const websiteDetails = location.state?.websiteDetails || {};

  const [selectedCategories, setSelectedCategories] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const iconMap = {
    'any': Zap,
    'technology': Code,
    'food-beverage': Utensils,
    'real-estate': Home,
    'automotive': Car,
    'health-wellness': Heart,
    'entertainment': Gamepad2,
    'fashion': Shirt,
    'education': BookOpen,
    'business-services': Briefcase,
    'travel-tourism': Plane,
    'arts-culture': Music,
    'photography': Camera,
    'gifts-events': Gift,
    'government-public': Shield,
    'general-retail': Building2
  };

  const [businessCategories, setBusinessCategories] = useState([]);

  useEffect(() => {
    fetchCategories();
    if (websiteId) {
      fetchExistingCategories();
    }
  }, [websiteId]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/business-categories/categories');
      if (response.data.success) {
        const categoriesWithIcons = response.data.data.categories.map(category => ({
          ...category,
          icon: iconMap[category.id] || Building2
        }));
        setBusinessCategories(categoriesWithIcons);
      }
    } catch (error) {
      setError('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `http://localhost:5000/api/business-categories/website/${websiteId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.data.success) {
        setSelectedCategories(response.data.data.businessCategories || []);
      }
    } catch (error) {
      console.log('No existing categories found or error fetching');
    }
  };

  const handleCategoryToggle = (categoryId) => {
    if (categoryId === 'any') {
      if (selectedCategories.includes('any')) {
        setSelectedCategories([]);
      } else {
        setSelectedCategories(['any']);
      }
    } else {
      let newSelection = selectedCategories.filter(id => id !== 'any');
      
      if (newSelection.includes(categoryId)) {
        newSelection = newSelection.filter(id => id !== categoryId);
      } else {
        newSelection = [...newSelection, categoryId];
      }
      
      setSelectedCategories(newSelection);
    }
  };

  const handleSubmit = async () => {
    if (selectedCategories.length === 0) {
      setError('Please select at least one business category');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `http://localhost:5000/api/business-categories/website/${websiteId}`,
        { businessCategories: selectedCategories },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        // Navigate to create categories page
        navigate(`/create-categories/${websiteId}`, {
          state: {
            websiteDetails: {
              ...websiteDetails,
              businessCategories: selectedCategories
            }
          }
        });
      }
      
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to update business categories');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Choose Business Categories
            </h1>
            <p className="text-gray-600 mb-4">
              Select the types of businesses you want to advertise on your website: <strong>{websiteDetails.name || 'Your Website'}</strong>
            </p>
            <div className="text-sm text-gray-500">
              You can choose specific categories or select "Any Category" to accept all types of advertisements.
            </div>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Available Categories</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {businessCategories.map((category) => {
              const Icon = category.icon;
              const isSelected = selectedCategories.includes(category.id);
              const isAnySelected = selectedCategories.includes('any');
              const isDisabled = isAnySelected && category.id !== 'any';

              return (
                <div
                  key={category.id}
                  onClick={() => !isDisabled && handleCategoryToggle(category.id)}
                  className={`
                    relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                    ${isSelected 
                      ? 'border-blue-500 bg-blue-50' 
                      : isDisabled 
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }
                    ${category.id === 'any' ? 'ring-2 ring-orange-200' : ''}
                  `}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`
                      p-2 rounded-lg
                      ${isSelected 
                        ? 'bg-blue-500 text-white' 
                        : category.id === 'any'
                          ? 'bg-orange-100 text-orange-600'
                          : 'bg-gray-100 text-gray-600'
                      }
                    `}>
                      <Icon className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className={`
                        font-medium text-sm
                        ${isSelected ? 'text-blue-900' : 'text-gray-900'}
                      `}>
                        {category.name}
                      </h3>
                      <p className={`
                        text-xs mt-1 line-clamp-2
                        ${isSelected ? 'text-blue-700' : 'text-gray-500'}
                      `}>
                        {category.description}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="bg-blue-500 text-white rounded-full p-1">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selection Summary */}
          {selectedCategories.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-medium text-blue-900 mb-2">Selected Categories:</h3>
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((categoryId) => {
                  const category = businessCategories.find(c => c.id === categoryId);
                  return (
                    <span
                      key={categoryId}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {category?.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {selectedCategories.length === 0 
                ? 'No categories selected'
                : `${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'} selected`
              }
            </div>
            
            <button
              onClick={handleSubmit}
              disabled={selectedCategories.length === 0 || isSubmitting}
              className={`
                flex items-center px-6 py-2 rounded-lg font-medium transition-all duration-200
                ${selectedCategories.length > 0 && !isSubmitting
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BusinessCategorySelection;





















// Update the createWebsite function to redirect to business categories
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

























// Update the handleSubmit function in WebsiteCreation.js
const handleSubmit = async (e) => {
  e.preventDefault();
  setUiState(prev => ({ ...prev, isSubmitting: true }));

  try {
    const formData = new FormData();
    formData.append('websiteName', formState.websiteName);
    formData.append('websiteLink', formState.websiteUrl);
    if (formState.imageUrl) {
      formData.append('file', formState.imageUrl);
    }

    const token = localStorage.getItem('token');
    const response = await axios.post(
      'http://localhost:5000/api/createWebsite',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.status === 201) {
      // Navigate to business categories selection first
      navigate(`/business-categories/${response.data._id}`, {
        state: {
          websiteDetails: {
            id: response.data._id,
            name: formState.websiteName,
            url: formState.websiteUrl,
            imageUrl: response.data.imageUrl
          }
        }
      });
    }
    
  } catch (error) {
    setUiState(prev => ({
      ...prev,
      error: error.response?.data?.message || 'Failed to create website'
    }));
  } finally {
    setUiState(prev => ({ ...prev, isSubmitting: false }));
  }
};


























// Add this route to your App.js routes
import BusinessCategorySelection from './components/BusinessCategorySelection';

// Inside your Routes component:
<Route path="/business-categories/:websiteId" element={<BusinessCategorySelection />} />

// The existing route should remain:
<Route path="/create-categories/:websiteId" element={<CreateCategories />} />

// Also add the business categories routes in your main app.js (backend):
const businessCategoriesRoutes = require('./routes/businessCategoriesRoutes');
app.use('/api/business-categories', businessCategoriesRoutes);






























// Add these fields to your existing CreateCategoryModel.js adCategorySchema
const adCategorySchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  categoryName: { type: String, required: true, minlength: 3 },
  description: { type: String, maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  spaceType: { type: String, required: true },
  userCount: { type: Number, default: 0 },
  instructions: { type: String },
  defaultLanguage: { 
    type: String, 
    enum: ['english', 'french', 'kinyarwanda', 'kiswahili', 'chinese', 'spanish'],
    default: 'english' 
  },
  customAttributes: { type: Map, of: String },
  
  // ADD THESE NEW FIELDS:
  allowedBusinessCategories: {
    type: [String],
    enum: [
      'any',
      'technology',
      'food-beverage',
      'real-estate',
      'automotive',
      'health-wellness',
      'entertainment',
      'fashion',
      'education',
      'business-services',
      'travel-tourism',
      'arts-culture',
      'photography',
      'gifts-events',
      'government-public',
      'general-retail'
    ],
    default: function() {
      // Default to website's business categories
      return [];
    }
  },
  
  apiCodes: {
    HTML: { type: String },
    JavaScript: { type: String },
    PHP: { type: String },
    Python: { type: String },
  },
  selectedAds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ImportAd' }],
  webOwnerEmail: { type: String, required: true },
  visitorRange: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

adCategorySchema.index({ ownerId: 1, websiteId: 1, categoryName: 1 });
adCategorySchema.index({ allowedBusinessCategories: 1 }); // Add index for business categories

const AdCategory = mongoose.model('AdCategory', adCategorySchema);
module.exports = AdCategory;


























// Update the createCategory function to include business categories from website
exports.createCategory = async (req, res) => {
  try {
    console.log('req.user:', req.user);
    console.log('req.headers:', req.headers);
    
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required. Please login.' });
    }

    const { 
      websiteId,
      categoryName,
      description,
      price,
      customAttributes,
      spaceType,
      userCount,
      instructions,
      visitorRange,
      tier
    } = req.body;

    const userId = req.user.userId || req.user.id || req.user._id;

    if (!userId) {
      console.error('No userId found in req.user:', req.user);
      return res.status(401).json({ message: 'User ID not found in authentication data' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found in database with ID:', userId);
      return res.status(401).json({ message: 'User not found in database' });
    }

    // GET WEBSITE TO ACCESS BUSINESS CATEGORIES
    const website = await Website.findById(websiteId);
    if (!website) {
      return res.status(404).json({ message: 'Website not found' });
    }

    // Verify website ownership
    if (website.ownerId !== userId.toString()) {
      return res.status(403).json({ message: 'You do not have permission to add categories to this website' });
    }

    // Check if business categories are selected
    if (!website.isBusinessCategoriesSelected || !website.businessCategories || website.businessCategories.length === 0) {
      return res.status(400).json({ 
        message: 'Please select business categories for your website first',
        requiresBusinessCategories: true 
      });
    }

    const ownerId = user._id.toString();
    const webOwnerEmail = user.email;

    // Validation
    if (!websiteId || !categoryName || !price || !spaceType || !visitorRange || !tier) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['websiteId', 'categoryName', 'price', 'spaceType', 'visitorRange', 'tier'],
        received: { websiteId, categoryName, price, spaceType, visitorRange, tier }
      });
    }

    // Create new category with website's business categories
    const newCategory = new AdCategory({
      ownerId,
      websiteId,
      categoryName,
      description,
      price,
      spaceType,
      userCount: userCount || 0,
      instructions,
      customAttributes: customAttributes || {},
      webOwnerEmail,
      selectedAds: [],
      visitorRange,
      tier,
      allowedBusinessCategories: website.businessCategories // SET FROM WEBSITE
    });

    const savedCategory = await newCategory.save();
    const { script } = generateScriptTag(savedCategory._id.toString());

    // Update with API codes
    savedCategory.apiCodes = {
      HTML: script,
      JavaScript: `const script = document.createElement('script');\nscript.src = "http://localhost:5000/api/ads/script/${savedCategory._id}";\ndocument.body.appendChild(script);`,
      PHP: `<?php echo '${script}'; ?>`,
      Python: `print('${script}')`
    };

    const finalCategory = await savedCategory.save();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: finalCategory
    });
    
  } catch (error) {
    console.error('Error creating category:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Category with this name already exists for this website' 
      });
    }

    res.status(500).json({ 
      message: 'Failed to create category', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};