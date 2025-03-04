// AdCategoryModel.js
const mongoose = require('mongoose');

const adCategorySchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  categoryName: { type: String, required: true, minlength: 3 },
  description: { type: String, maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  spaceType: { type: String, required: true },
  userCount: { type: Number, default: 0 },
  instructions: { type: String },
  customAttributes: { type: Map, of: String },
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

const AdCategory = mongoose.model('AdCategory', adCategorySchema);
module.exports = AdCategory;

// AdCategoryController.js
const mongoose = require('mongoose');
const AdCategory = require('../models/AdCategoryModel');

exports.getCategoriesByWebsiteForAdvertisers = async (req, res) => {
  const { websiteId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    // Validate websiteId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(websiteId)) {
      return res.status(400).json({ message: 'Invalid website ID' });
    }

    const websiteObjectId = new mongoose.Types.ObjectId(websiteId);

    const categories = await AdCategory.aggregate([
      { $match: { websiteId: websiteObjectId } },
      {
        $lookup: {
          from: 'importads', 
          let: { categoryId: '$_id' },
          pipeline: [
            { $unwind: { path: '$websiteSelections', preserveNullAndEmptyArrays: true } },
            { $match: { 
              $expr: { 
                $and: [
                  { $eq: ['$websiteSelections.websiteId', websiteObjectId] },
                  { $in: ['$$categoryId', '$websiteSelections.categories'] }
                ]
              }
            }},
            { $count: 'categoryCount' }
          ],
          as: 'currentUserCount'
        }
      },
      {
        $addFields: {
          currentUserCount: { 
            $ifNull: [{ $arrayElemAt: ['$currentUserCount.categoryCount', 0] }, 0] 
          },
          isFullyBooked: { 
            $gte: [
              { $ifNull: [{ $arrayElemAt: ['$currentUserCount.categoryCount', 0] }, 0] }, 
              '$userCount' 
            ] 
          }
        }
      }
    ])
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const count = await AdCategory.countDocuments({ websiteId: websiteObjectId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error in getCategoriesByWebsiteForAdvertisers:', error);
    res.status(500).json({ 
      message: 'Failed to fetch categories', 
      error: error.message 
    });
  }
};

exports.getCategoriesByWebsite = async (req, res) => {
  const { websiteId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ websiteId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ websiteId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
  }
};

// AdCategoryRoutes.js
const express = require('express');
const router = express.Router();
const adCategoryController = require('../controllers/AdCategoryController');

router.get('/:websitesId/advertiser', adCategoryController.getCategoriesByWebsiteForAdvertisers);
router.get('/:websiteId', adCategoryController.getCategoriesByWebsite);

module.exports = router;

// Categories.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LinkIcon,
  Check,
  Tag,
  DollarSign,
  Info,
  X,
  Loader2,
} from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import Header from '../../components/backToPreviousHeader';
import Loading from '../../components/LoadingSpinner';
import axios from 'axios';

const Categories = () => {
  const { user } = useUser();
  
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    file,
    userId,
    businessName,
    businessLink,
    businessLocation,
    adDescription,
    selectedWebsites
  } = location.state || {};

  const [categoriesByWebsite, setCategoriesByWebsite] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [error, setError] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const adOwnerEmail = user.primaryEmailAddress.emailAddress;

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const promises = selectedWebsites.map(async (websiteId) => {
          const websiteResponse = await fetch(`http://localhost:5000/api/websites/website/${websiteId}`);
          const websiteData = await websiteResponse.json();
          const categoriesResponse = await fetch(`http://localhost:5000/api/ad-categories/${websiteId}/advertiser`);
          const categoriesData = await categoriesResponse.json();

          return {
            websiteName: websiteData.websiteName || 'Unknown Website',
            websiteLink: websiteData.websiteLink || '#',
            categories: categoriesData.categories || [],
          };
        });
        const result = await Promise.all(promises);
        setCategoriesByWebsite(result);
      } catch (error) {
        console.error('Failed to fetch categories or websites:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (selectedWebsites) fetchCategories();
  }, [selectedWebsites]);

  const handleCategorySelection = (categoryId) => {
    setSelectedCategories((prevSelected) =>
      prevSelected.includes(categoryId) 
        ? prevSelected.filter((id) => id !== categoryId) 
        : [...prevSelected, categoryId]
    );
    setError(false);
  };

  const handleNext = async(e) => {
    e.preventDefault();
    if (selectedCategories.length === 0) {
      setError(true);
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('adOwnerEmail', adOwnerEmail);
      formData.append('file', file);
      formData.append('userId', userId);
      formData.append('businessName', businessName);
      formData.append('businessLink', businessLink);
      formData.append('businessLocation', businessLocation);
      formData.append('adDescription', adDescription);
      formData.append('selectedWebsites', JSON.stringify(selectedWebsites));
      formData.append('selectedCategories', JSON.stringify(selectedCategories));
      // formData.append('selectedSpaces', JSON.stringify(selectedSpaces));

      await axios.post('http://localhost:5000/api/importAds', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      navigate('/dashboard');
    } catch (error) {
      console.error('Error during ad upload:', error);
      setError('An error occurred while uploading the ad');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl text-blue-950 font-bold">
                Select Categories
              </h1>
              <p className="text-gray-600">
                Choose relevant categories for your advertisement
              </p>
            </div>
            <button 
              onClick={handleNext}
              className={`w-full sm:w-auto mt-6 sm:mt-0 flex items-center justify-center px-6 py-3 rounded-lg font-bold text-white sm:text-base transition-all duration-300 ${
                selectedCategories.length === 0 
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-[#FF4500] hover:bg-orange-500 hover:-translate-y-0.5'
              }`}
            >
              Next
            </button>
          </div>

          {error && (
            <div className="mx-8 my-6 flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">
              <Info className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">Please select at least one category to proceed</span>
            </div>
          )}

          <div className="p-8">
            {isLoading ? (
              <div className="flex justify-center items-center min-h-[400px]">
                <LoadingSpinner />
              </div>
            ) : categoriesByWebsite.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                {categoriesByWebsite.map((website) => (
                  <div 
                    key={website.websiteName} 
                    className="flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden transition-shadow duration-300 hover:shadow-lg"
                  >
                    <div className="bg-gradient-to-r from-gray-50 to-white p-4 flex justify-between items-center border-b border-gray-200">
                      <h2 className="text-lg font-semibold text-blue-950">{website.websiteName}</h2>
                      <a 
                        href={website.websiteLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <LinkIcon className="w-5 h-5" />
                      </a>
                    </div>
                    
                    {website.categories.length > 0 ? (
                      <div className="p-6 grid gap-4">
                        {website.categories.map((category) => (
                          <div
                            key={category._id}
                            onClick={() => 
                              !category.isFullyBooked && handleCategorySelection(category._id)
                            }
                            className={`group relative flex flex-col bg-white rounded-xl p-5 border-2 transition-all duration-300 ${
                              category.isFullyBooked 
                                ? 'opacity-50 cursor-not-allowed bg-gray-100' 
                                : 'cursor-pointer hover:shadow-lg'
                            } ${
                              selectedCategories.includes(category._id)
                                ? 'border-[#FF4500] bg-red-50/50 scale-[1.02]'
                                : 'border-gray-200'
                            }`}
                          >
                            {category.isFullyBooked && (
                              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                                Fully Booked
                              </div>
                            )}
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                  <Tag className="w-5 h-5 text-blue-600" />
                                </div>
                                <h3 className="font-semibold text-blue-950">
                                  {category.categoryName}
                                </h3>
                              </div>
                              {selectedCategories.includes(category._id) && (
                                <div className="p-1 bg-blue-500 rounded-full">
                                  <Check size={16} className="text-white" />
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-start gap-2 mb-4">
                              <p className="text-gray-600 text-sm leading-relaxed line-clamp-2">
                                {category.description}
                              </p>
                              {category.description.length > 100 && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDescription(category.description);
                                  }}
                                  className="flex-shrink-0 p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                  <Info className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                              <span className="text-sm font-medium text-green-600">RWF</span>
                              <span className="text-lg font-semibold text-blue-950">{category.price}</span>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                              <span className="text-sm font-medium text-green-600">RWF</span>
                              <span className="text-lg font-semibold text-blue-950">{category.price}</span>
                              {category.isFullyBooked && (
                                <span className="ml-2 text-sm text-red-500">(Space Full)</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-12 text-center text-gray-500">
                        <p className="font-medium">No categories available</p>
                        <p className="text-sm text-gray-400 mt-1">Check back later for updates</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-lg font-medium text-gray-600">No categories available</p>
                <p className="text-sm text-gray-500 mt-1">Please select different websites and try again</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Categories;