// AdDetailController.js - Add this file to your controllers folder

const ImportAd = require('../models/ImportAdModel');

// Endpoint to get ad details for modal
exports.getAdDetails = async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { adId } = req.params;
    
    if (!adId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ad ID is required' 
      });
    }
    
    const ad = await ImportAd.findById(adId);
    
    if (!ad) {
      return res.status(404).json({ 
        success: false, 
        message: 'Ad not found' 
      });
    }
    
    // Return only necessary data for the modal
    res.json({
      success: true,
      ad: {
        _id: ad._id,
        businessName: ad.businessName,
        businessLink: ad.businessLink,
        businessLocation: ad.businessLocation,
        adDescription: ad.adDescription,
        imageUrl: ad.imageUrl,
        videoUrl: ad.videoUrl,
        pdfUrl: ad.pdfUrl
      }
    });
    
  } catch (error) {
    console.error('Error getting ad details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving ad details' 
    });
  }
};

// Track modal views separately (optional)
exports.trackModalView = async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { adId } = req.params;
    
    if (!adId) {
      return res.status(400).json({ success: false });
    }
    
    // You could track modal views in a separate collection if needed
    // For now, just respond with success
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error tracking modal view:', error);
    res.status(500).json({ success: false });
  }
};