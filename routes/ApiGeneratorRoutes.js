// ApiGeneratorRoutes.js
const express = require('express');
const router = express.Router();
const apiGeneratorController = require('../controllers/ApiGeneratorController');

router.post('/', apiGeneratorController.generateApi);

module.exports = router;