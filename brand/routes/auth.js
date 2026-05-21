// Auth.js
const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  instagramAuth,
  instagramCallback,
  youtubeAuth,
  youtubeCallback,
  disconnect
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/instagram', protect, instagramAuth);
router.get('/instagram/callback', instagramCallback);
router.get('/youtube', protect, youtubeAuth);
router.get('/youtube/callback', youtubeCallback);
router.delete('/disconnect/:platform', protect, disconnect);

module.exports = router;