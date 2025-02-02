// routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// Route for login
router.post('/', authController.login);

// Route to initialize admin (only used during setup)
router.get('/init-admin', authController.initAdmin);

module.exports = router;
