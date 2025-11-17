// routes/conversationRoutes.js
const express = require('express');
const conversationController = require('../controllers/conversationController');
const authMiddleware = require('../middleware/authmiddleware');

const router = express.Router();

// All conversation routes require authentication
router.use(authMiddleware);

// Get all conversations
router.get('/', conversationController.getConversations);

// Get single conversation
router.get('/:id', conversationController.getConversation);

// Create new conversation
router.post('/', conversationController.createConversation);

// Update conversation
router.put('/:id', conversationController.updateConversation);

// Delete conversation
router.delete('/:id', conversationController.deleteConversation);

module.exports = router;