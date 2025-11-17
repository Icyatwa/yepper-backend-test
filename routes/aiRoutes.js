// routes/aiRoutes.js
const express = require('express');
const aiController = require('../controllers/aiController');

const router = express.Router();

// Generate AI response (no auth required for guest access)
router.post('/generate', aiController.generateResponse);

module.exports = router;