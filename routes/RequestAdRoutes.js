// RequestAdRoutes.js
const express = require('express');
const router = express.Router();
const requestAdController = require('../controllers/RequestAdController');

router.post('/', requestAdController.createRequestAd);
router.get('/', requestAdController.getAllAds);
router.get('/ad/:id', requestAdController.getAdByIds);
router.get('/ads/:userId', requestAdController.getAdsByUserId);

module.exports = router;

