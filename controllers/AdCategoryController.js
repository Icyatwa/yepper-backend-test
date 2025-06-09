// const mongoose = require('mongoose');
// const AdCategory = require('../models/AdCategoryModel');
// const ImportAd = require('../models/ImportAdModel');

// const generateScriptTag = (categoryId) => {
//   return {
//     script: `<script src="https://yepper-backend.onrender.com/api/ads/script/${categoryId}"></script>`
//   };
// };

// exports.createCategory = async (req, res) => {
//   try {
//     const { 
//       ownerId, 
//       websiteId, 
//       categoryName, 
//       description, 
//       price, 
//       customAttributes,
//       spaceType,
//       userCount,
//       instructions,
//       webOwnerEmail,
//       visitorRange,
//       tier
//     } = req.body;

//     if (!ownerId || !websiteId || !categoryName || !price || !spaceType || !webOwnerEmail || !visitorRange || !tier) {
//       return res.status(400).json({ message: 'Missing required fields' });
//     }

//     const newCategory = new AdCategory({
//       ownerId,
//       websiteId,
//       categoryName,
//       description,
//       price,
//       spaceType,
//       userCount: userCount || 0,
//       instructions,
//       customAttributes: customAttributes || {},
//       webOwnerEmail,
//       selectedAds: [],
//       visitorRange,
//       tier
//     });

//     const savedCategory = await newCategory.save();
//     const { script } = generateScriptTag(savedCategory._id.toString());

//     savedCategory.apiCodes = {
//       HTML: script,
//       JavaScript: `const script = document.createElement('script');\nscript.src = "http://localhost:5000/api/ads/script/${savedCategory._id}";\ndocument.body.appendChild(script);`,
//       PHP: `<?php echo '${script}'; ?>`,
//       Python: `print('${script}')`
//     };

//     const finalCategory = await savedCategory.save();

//     res.status(201).json(finalCategory);
    
//   } catch (error) {
//     console.error('Error creating category:', error);
//     res.status(500).json({ 
//       message: 'Failed to create category', 
//       error: error.message 
//     });
//   }
// };

// exports.deleteCategory = async (req, res) => {
//   const session = await mongoose.startSession();
  
//   try {
//     const { categoryId } = req.params;
//     const { ownerId } = req.body;

//     // Find the category
//     const category = await AdCategory.findById(categoryId);

//     // Check if category exists
//     if (!category) {
//       return res.status(404).json({ message: 'Category not found' });
//     }

//     // Verify the owner
//     if (category.ownerId !== ownerId) {
//       return res.status(403).json({ message: 'Unauthorized to delete this category' });
//     }

//     // Check for any ads with this category confirmed or approved
//     const existingAds = await ImportAd.find({
//       'websiteSelections': {
//         $elemMatch: {
//           'categories': categoryId,
//           $or: [
//             { 'confirmed': true },
//             { 'approved': true }
//           ]
//         }
//       }
//     });

//     // If any ads exist with this category confirmed or approved, prevent deletion
//     if (existingAds.length > 0) {
//       return res.status(400).json({ 
//         message: 'Cannot delete category with active or confirmed ads',
//         affectedAds: existingAds.map(ad => ad._id)
//       });
//     }

//     // Start transaction
//     session.startTransaction();

//     try {
//       // Delete the category
//       await AdCategory.findByIdAndDelete(categoryId).session(session);

//       // Remove references to this category from all ImportAd documents
//       await ImportAd.updateMany(
//         { 'websiteSelections.categories': categoryId },
//         { 
//           $pull: { 
//             'websiteSelections.$.categories': categoryId 
//           } 
//         }
//       ).session(session);

//       // Commit the transaction
//       await session.commitTransaction();

//       res.status(200).json({ 
//         message: 'Category deleted successfully' 
//       });

//     } catch (transactionError) {
//       // Abort the transaction on error
//       await session.abortTransaction();
//       throw transactionError;
//     }

//   } catch (error) {
//     console.error('Error deleting category:', error);
    
//     // Ensure session is ended even if there's an error
//     if (session) {
//       await session.endSession();
//     }

//     res.status(500).json({ 
//       message: 'Failed to delete category', 
//       error: error.message 
//     });
//   } finally {
//     // Ensure session is always ended
//     if (session) {
//       await session.endSession();
//     }
//   }
// };

// exports.getCategories = async (req, res) => {
//   const { ownerId } = req.params;
//   const { page = 1, limit = 10 } = req.query;

//   try {
//     const categories = await AdCategory.find({ ownerId })
//       .limit(limit * 1)
//       .skip((page - 1) * limit)
//       .exec();

//     const count = await AdCategory.countDocuments({ ownerId });

//     res.status(200).json({
//       categories,
//       totalPages: Math.ceil(count / limit),
//       currentPage: page
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to fetch categories', error });
//   }
// };

// exports.getCategoriesByWebsite = async (req, res) => {
//   const { websiteId } = req.params;
//   const { page = 1, limit = 10 } = req.query;

//   try {
//     const categories = await AdCategory.find({ websiteId })
//       .limit(limit * 1)
//       .skip((page - 1) * limit)
//       .exec();

//     const count = await AdCategory.countDocuments({ websiteId });

//     res.status(200).json({
//       categories,
//       totalPages: Math.ceil(count / limit),
//       currentPage: page
//     });
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to fetch categories', error });
//   }
// };

// exports.getCategoryById = async (req, res) => {
//   const { categoryId } = req.params;

//   try {
//     const category = await AdCategory.findById(categoryId);

//     if (!category) {
//       return res.status(404).json({ message: 'Category not found' });
//     }

//     res.status(200).json(category);
//   } catch (error) {
//     res.status(500).json({ message: 'Failed to fetch category', error });
//   }
// };














// AdCategoryController.js
const mongoose = require('mongoose');
const AdCategory = require('../models/AdCategoryModel');
const crypto = require('crypto');
const ImportAd = require('../models/ImportAdModel');

const generateScriptTag = (categoryId) => {
  return {
    script: `<script src="https://yepper-backend.onrender.com/api/ads/script/${categoryId}"></script>`
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
      JavaScript: `const script = document.createElement('script');\nscript.src = "https://yepper-backend.onrender.com/api/ads/script/${savedCategory._id}";\ndocument.body.appendChild(script);`,
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

exports.resetUserCount = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { newUserCount } = req.body;

    // Validate input
    if (!newUserCount || newUserCount < 0) {
      return res.status(400).json({ 
        error: 'Invalid Input', 
        message: 'User count must be a non-negative number' 
      });
    }

    // Find the category
    const category = await AdCategory.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Category not found' 
      });
    }

    // Count current users who have selected this category
    const currentUserCount = await ImportAd.countDocuments({
      'websiteSelections.categories': categoryId,
      'websiteSelections.approved': true
    });

    // Ensure new user count is not less than current users
    if (newUserCount < currentUserCount) {
      return res.status(400).json({ 
        error: 'Invalid Reset', 
        message: 'New user count cannot be less than current approved users' 
      });
    }

    // Update the category with new user count
    category.userCount = newUserCount;
    await category.save();

    res.status(200).json({
      message: 'User count reset successfully',
      category
    });
  } catch (error) {
    console.error('Error resetting user count:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};

exports.deleteCategory = async (req, res) => {
  const session = await mongoose.startSession();
  
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

    // Check for any ads with this category confirmed or approved
    const existingAds = await ImportAd.find({
      'websiteSelections': {
        $elemMatch: {
          'categories': categoryId,
          $or: [
            { 'confirmed': true },
            { 'approved': true }
          ]
        }
      }
    });

    // If any ads exist with this category confirmed or approved, prevent deletion
    if (existingAds.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category with active or confirmed ads',
        affectedAds: existingAds.map(ad => ad._id)
      });
    }

    // Start transaction
    session.startTransaction();

    try {
      // Delete the category
      await AdCategory.findByIdAndDelete(categoryId).session(session);

      // Remove references to this category from all ImportAd documents
      await ImportAd.updateMany(
        { 'websiteSelections.categories': categoryId },
        { 
          $pull: { 
            'websiteSelections.$.categories': categoryId 
          } 
        }
      ).session(session);

      // Commit the transaction
      await session.commitTransaction();

      res.status(200).json({ 
        message: 'Category deleted successfully' 
      });

    } catch (transactionError) {
      // Abort the transaction on error
      await session.abortTransaction();
      throw transactionError;
    }

  } catch (error) {
    console.error('Error deleting category:', error);
    
    // Ensure session is ended even if there's an error
    if (session) {
      await session.endSession();
    }

    res.status(500).json({ 
      message: 'Failed to delete category', 
      error: error.message 
    });
  } finally {
    // Ensure session is always ended
    if (session) {
      await session.endSession();
    }
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

exports.updateCategoryLanguage = async (req, res) => {
  const { categoryId } = req.params;
  const { defaultLanguage } = req.body;
  
  try {
    const updatedCategory = await AdCategory.findByIdAndUpdate(
      categoryId,
      { defaultLanguage },
      { new: true, runValidators: true }
    );
    
    if (!updatedCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    res.status(200).json(updatedCategory);
  } catch (error) {
    console.error('Error updating category language:', error);
    res.status(500).json({ message: 'Error updating category language', error: error.message });
  }
};