// // ImportAdRoutes.js
// const express = require('express');
// const router = express.Router();
// const importAdController = require('../controllers/ImportAdController');

// router.post('/', importAdController.createImportAd);
// router.get('/', importAdController.getAllAds);

// // router.post('/initiate', importAdController.initiatePayment);
// // router.get('/callback', importAdController.paymentCallback);

// // router.get('/:id', importAdController.getAdById);
// router.get('/ad/:id', importAdController.getAdByIds);
// router.get('/ads/:userId', importAdController.getAdsByUserId);
// router.get('/ads/:userId/with-clicks', importAdController.getAdsByUserIdWithClicks);

// module.exports = router;

// ImportAdRoutes.js
const express = require('express');
const router = express.Router();
const importAdController = require('../controllers/ImportAdController');

router.post('/', importAdController.createImportAd);
router.get('/', importAdController.getAllAds);
router.get('/ad/:id', importAdController.getAdByIds);
router.get('/ads/:userId', importAdController.getAdsByUserId);
router.get('/projects/:userId', importAdController.getProjectsByUserId);
router.get('/ads/:userId/with-clicks', importAdController.getAdsByUserIdWithClicks);

module.exports = router;