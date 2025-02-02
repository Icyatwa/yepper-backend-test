// ApiViewController.js
const GeneratedApi = require('../models/GeneratedApiModel');

exports.getApisByWebsiteAndCategory = async (req, res) => {
  const { websiteId } = req.params;

  try {
    const apis = await GeneratedApi.find({ websiteId }).populate('categoryId');
    res.status(200).json(apis);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch APIs', error });
  }
};