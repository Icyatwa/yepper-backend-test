const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');

router.post('/forgot-password', passwordController.forgotPassword);
router.post('/waitlist-forgot-password', passwordController.waitlistForgotPassword);
router.post('/reset-password', passwordController.resetPassword);

module.exports = router;