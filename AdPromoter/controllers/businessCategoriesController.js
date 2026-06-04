// businessCategoriesController.js — PostgreSQL version
const Website = require('../models/CreateWebsiteModel');
const User    = require('../../models/User');
const jwt     = require('jsonwebtoken');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token is required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

const validCategories = [
  'any','technology','food-beverage','real-estate','automotive','health-wellness',
  'entertainment','fashion','education','business-services','travel-tourism',
  'arts-culture','photography','gifts-events','government-public','general-retail'
];

exports.updateBusinessCategories = [authenticateToken, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { businessCategories } = req.body;
    const userId = req.user.id.toString();

    if (!businessCategories || !Array.isArray(businessCategories))
      return res.status(400).json({ message: 'businessCategories must be an array' });
    if (businessCategories.length === 0)
      return res.status(400).json({ message: 'At least one business category must be selected' });

    const invalid = businessCategories.filter(c => !validCategories.includes(c));
    if (invalid.length) return res.status(400).json({ message: `Invalid categories: ${invalid.join(', ')}` });
    if (businessCategories.includes('any') && businessCategories.length > 1)
      return res.status(400).json({ message: 'If "any" is selected, no other categories should be selected' });

    // Verify ownership
    const website = await Website.findById(websiteId);
    if (!website || website.owner_id.toString() !== userId)
      return res.status(404).json({ message: 'Website not found or no permission' });

    const updated = await Website.update(websiteId, {
      businessCategories,
      isBusinessCategoriesSelected: true
    });

    res.status(200).json({ success: true, message: 'Business categories updated successfully', website: updated });
  } catch (error) {
    console.error('Error updating business categories:', error);
    res.status(500).json({ message: 'Failed to update business categories', error: error.message });
  }
}];

exports.getBusinessCategories = [authenticateToken, async (req, res) => {
  try {
    const { websiteId } = req.params;
    const userId = req.user.id.toString();

    const website = await Website.findById(websiteId);
    if (!website || website.owner_id.toString() !== userId)
      return res.status(404).json({ message: 'Website not found or no permission' });

    res.status(200).json({
      success: true,
      data: {
        websiteId: website.id,
        websiteName: website.website_name,
        businessCategories: website.business_categories,
        isBusinessCategoriesSelected: website.is_business_categories_selected
      }
    });
  } catch (error) {
    console.error('Error fetching business categories:', error);
    res.status(500).json({ message: 'Failed to fetch business categories', error: error.message });
  }
}];

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
  res.status(200).json({ success: true, data: { categories: categoryDetails, validIds: validCategories } });
};
