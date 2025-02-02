// WaitlistRoutes.js
const express = require('express');
const router = express.Router();
const waitlistController = require('../controllers/SitePartnerController');

router.post('/', waitlistController.createWaitlist);

module.exports = router;
