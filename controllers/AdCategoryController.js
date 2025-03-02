const AdCategory = require('../models/AdCategoryModel');
const crypto = require('crypto');
const ImportAd = require('../models/ImportAdModel');

const generateScriptTag = (categoryId) => {
  return {
    script: `<script src="http://localhost:5000/api/ads/script/${categoryId}"></script>`
  };
};

exports.createCategory = async (req, res) => {
  try {
    const { 
      ownerId, 
      websiteId, 
      categoryName, 
      description, 
      price, 
      customAttributes,
      spaceType,
      userCount,
      instructions,
      webOwnerEmail,
      visitorRange,
      tier
    } = req.body;

    if (!ownerId || !websiteId || !categoryName || !price || !spaceType || !webOwnerEmail || !visitorRange || !tier) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

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
      tier
    });

    const savedCategory = await newCategory.save();
    const { script } = generateScriptTag(savedCategory._id.toString());

    savedCategory.apiCodes = {
      HTML: script,
      JavaScript: `const script = document.createElement('script');\nscript.src = "http://localhost:5000/api/ads/script/${savedCategory._id}";\ndocument.body.appendChild(script);`,
      PHP: `<?php echo '${script}'; ?>`,
      Python: `print('${script}')`
    };

    const finalCategory = await savedCategory.save();

    res.status(201).json(finalCategory);
    
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ 
      message: 'Failed to create category', 
      error: error.message 
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { ownerId } = req.body;

    // Find the category
    const category = await AdCategory.findById(categoryId);

    // Check if category exists
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Verify the owner
    if (category.ownerId !== ownerId) {
      return res.status(403).json({ message: 'Unauthorized to delete this category' });
    }

    // Check if any ads have been confirmed for this category
    const hasConfirmedAds = await ImportAd.exists({
      websiteSelections: {
        $elemMatch: {
          categories: categoryId,
          confirmed: true
        }
      }
    });

    if (hasConfirmedAds) {
      return res.status(400).json({ 
        message: 'Cannot delete category with confirmed ads' 
      });
    }

    // Delete the category
    await AdCategory.findByIdAndDelete(categoryId);

    res.status(200).json({ 
      message: 'Category deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ 
      message: 'Failed to delete category', 
      error: error.message 
    });
  }
};

exports.getCategories = async (req, res) => {
  const { ownerId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const categories = await AdCategory.find({ ownerId })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await AdCategory.countDocuments({ ownerId });

    res.status(200).json({
      categories,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch categories', error });
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

exports.getCategoryById = async (req, res) => {
  const { categoryId } = req.params;

  try {
    const category = await AdCategory.findById(categoryId);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch category', error });
  }
};